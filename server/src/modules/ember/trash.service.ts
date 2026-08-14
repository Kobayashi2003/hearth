import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

import type { Logger } from 'pino';
import type { TrashItem, TrashSettings } from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import type { RuntimeState } from '../../config/runtime-state.js';
import { fromNodeError, HearthError } from '../../lib/errors.js';
import { JsonDocument } from '../../lib/json-store.js';
import type { SafePath, Vault } from '../../lib/vault.js';
import { exists, resolveCollision } from '../vault/fileops.service.js';

interface TrashRecord {
  id: string;
  name: string;
  /** Root-relative path the item was deleted from. */
  originalPath: string;
  /** Which root it belonged to — restoring into a different root is refused. */
  rootId: string;
  deletedAt: string;
  size: number;
  isDirectory: boolean;
}

interface TrashIndex {
  items: TrashRecord[];
}

const PAYLOAD_DIRECTORY = 'items';
const DAY_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * The recycle bin. Deleted items are moved into a store outside the served
 * tree, described by an index file, so a restore can put them back exactly
 * where they came from.
 */
export class TrashService {
  private readonly index: JsonDocument<TrashIndex>;
  private readonly payloadRoot: string;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly runtime: RuntimeState,
    private readonly vault: Vault,
    private readonly logger: Logger,
  ) {
    this.payloadRoot = path.join(config.trash.directory, PAYLOAD_DIRECTORY);
    this.index = new JsonDocument<TrashIndex>(path.join(config.trash.directory, 'index.json'), () => ({
      items: [],
    }));
  }

  get enabled(): boolean {
    return this.runtime.get('trashEnabled');
  }

  settings(): TrashSettings {
    return {
      enabled: this.enabled,
      retentionDays: this.config.trash.retentionDays,
      maxSizeMB: this.config.trash.maxSizeMB,
      autoCleanup: this.config.trash.autoCleanup,
    };
  }

  startAutoCleanup(): void {
    if (!this.config.trash.autoCleanup || this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      void this.cleanup().catch(error => this.logger.warn({ err: error }, 'trash cleanup failed'));
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
    void this.cleanup().catch(() => undefined);
  }

  stopAutoCleanup(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  /** Move an item into the bin. Returns its bin id. */
  async accept(target: SafePath, isDirectory: boolean, size: number): Promise<string> {
    const id = crypto.randomBytes(12).toString('hex');
    const payload = path.join(this.payloadRoot, id);

    await fsp.mkdir(this.payloadRoot, { recursive: true });
    try {
      await fsp.rename(target, payload);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') {
        throw fromNodeError(error, 'Could not move that item to the recycle bin');
      }
      // The bin may sit on a different volume from the root.
      await fsp.cp(target, payload, { recursive: true });
      await fsp.rm(target, { recursive: true, force: true });
    }

    await this.index.update(current => ({
      items: [
        ...current.items,
        {
          id,
          name: path.basename(target),
          originalPath: this.vault.relativize(target),
          rootId: this.runtime.get('activeRootId'),
          deletedAt: new Date().toISOString(),
          size,
          isDirectory,
        },
      ],
    }));

    return id;
  }

  /**
   * Records whose payload has gone missing are dropped, so a bin edited from
   * outside Hearth does not surface entries that cannot be restored.
   */
  async list(): Promise<{ items: TrashItem[]; totalSize: number }> {
    const rootId = this.runtime.get('activeRootId');
    const records = this.index.read().items.filter(record => record.rootId === rootId);

    const live: TrashRecord[] = [];
    for (const record of records) {
      if (await exists(path.join(this.payloadRoot, record.id))) live.push(record);
    }

    if (live.length !== records.length) await this.reconcile();

    return {
      items: live
        .map(({ rootId: _rootId, ...item }) => item)
        .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)),
      totalSize: live.reduce((sum, record) => sum + record.size, 0),
    };
  }

  /**
   * Returns both paths: a name collision at the original location means the
   * item comes back as "name (2)", and Ledger needs to know that to carry the
   * reading position across.
   */
  async restore(id: string): Promise<{ path: string; originalPath: string }> {
    const record = this.requireRecord(id);
    if (record.rootId !== this.runtime.get('activeRootId')) {
      throw HearthError.badRequest('That item belongs to a different root');
    }

    // Re-resolving proves the original location is still inside the root, which
    // matters because the root may have changed since the delete.
    const originalTarget = this.vault.resolve(record.originalPath);
    const parent = path.dirname(originalTarget);
    await fsp.mkdir(parent, { recursive: true });

    const destination = await resolveCollision(parent, record.name);
    const payload = path.join(this.payloadRoot, record.id);

    try {
      await fsp.rename(payload, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') {
        throw fromNodeError(error, 'Could not restore that item');
      }
      await fsp.cp(payload, destination, { recursive: true });
      await fsp.rm(payload, { recursive: true, force: true });
    }

    await this.forget(id);
    return {
      path: this.vault.relativize(destination as SafePath),
      originalPath: record.originalPath,
    };
  }

  async purge(id: string): Promise<void> {
    this.requireRecord(id);
    await fsp.rm(path.join(this.payloadRoot, id), { recursive: true, force: true });
    await this.forget(id);
  }

  /** Empty the bin for the active root, leaving other roots' items alone. */
  async empty(): Promise<number> {
    const rootId = this.runtime.get('activeRootId');
    const doomed = this.index.read().items.filter(record => record.rootId === rootId);

    for (const record of doomed) {
      await fsp.rm(path.join(this.payloadRoot, record.id), { recursive: true, force: true });
    }
    await this.index.update(current => ({
      items: current.items.filter(record => record.rootId !== rootId),
    }));

    return doomed.length;
  }

  /** Drop items past the retention window, then oldest-first until under the size cap. */
  async cleanup(): Promise<void> {
    const { retentionDays, maxSizeMB } = this.config.trash;
    const records = [...this.index.read().items].sort((a, b) => a.deletedAt.localeCompare(b.deletedAt));

    const expiredBefore = Date.now() - retentionDays * DAY_MS;
    const doomed = new Set<string>();
    let retainedSize = 0;

    for (const record of records) {
      if (retentionDays > 0 && Date.parse(record.deletedAt) < expiredBefore) {
        doomed.add(record.id);
      } else {
        retainedSize += record.size;
      }
    }

    if (maxSizeMB > 0) {
      const capBytes = maxSizeMB * 1024 * 1024;
      for (const record of records) {
        if (retainedSize <= capBytes) break;
        if (doomed.has(record.id)) continue;
        doomed.add(record.id);
        retainedSize -= record.size;
      }
    }

    if (doomed.size === 0) return;

    for (const id of doomed) {
      await fsp.rm(path.join(this.payloadRoot, id), { recursive: true, force: true });
    }
    await this.index.update(current => ({
      items: current.items.filter(record => !doomed.has(record.id)),
    }));
    this.logger.info({ removed: doomed.size }, 'recycle bin cleaned up');
  }

  private requireRecord(id: string): TrashRecord {
    const record = this.index.read().items.find(item => item.id === id);
    if (!record) throw HearthError.notFound('No such item in the recycle bin');
    return record;
  }

  private async forget(id: string): Promise<void> {
    await this.index.update(current => ({
      items: current.items.filter(record => record.id !== id),
    }));
  }

  private async reconcile(): Promise<void> {
    const surviving: TrashRecord[] = [];
    for (const record of this.index.read().items) {
      if (await exists(path.join(this.payloadRoot, record.id))) surviving.push(record);
    }
    await this.index.update(() => ({ items: surviving }));
  }
}
