import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

import type { Logger } from 'pino';
import type { TrashItem, TrashSettings } from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import type { RuntimeState } from '../../config/runtime-state.js';
import { fromNodeError, HearthError } from '../../lib/errors.js';
import { JsonDocument } from '../../lib/json-store.js';
import { capOrZero } from '../../lib/limits.js';
import type { SafePath, Vault } from '../../lib/vault.js';
import { exists, moveAcrossVolumes, resolveCollision } from '../vault/fileops.service.js';

interface TrashRecord {
  id: string;
  name: string;
  originalPath: string;
  /** Restoring into a different root is refused. */
  rootId: string;
  deletedAt: string;
  size: number;
  isDirectory: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/** Ember: deleted items move to a store outside the served tree, described by an index file. */
export class TrashService {
  private readonly index: JsonDocument<{ items: TrashRecord[] }>;
  private readonly payloadRoot: string;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly runtime: RuntimeState,
    private readonly vault: Vault,
    private readonly logger: Logger,
  ) {
    this.payloadRoot = path.join(config.trash.directory, 'items');
    this.index = new JsonDocument(path.join(config.trash.directory, 'index.json'), () => ({
      items: [],
    }));
  }

  get enabled(): boolean {
    return this.runtime.get('trashEnabled');
  }

  settings(): TrashSettings {
    return {
      enabled: this.enabled,
      retentionDays: capOrZero(this.runtime.get('trashRetentionDays')),
    };
  }

  startAutoCleanup(): void {
    if (!this.config.trash.autoCleanup || this.cleanupTimer) return;
    const run = () =>
      void this.cleanup().catch(error => this.logger.warn({ err: error }, 'trash cleanup failed'));
    this.cleanupTimer = setInterval(run, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
    run();
  }

  stopAutoCleanup(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  async accept(target: SafePath, isDirectory: boolean, size: number): Promise<string> {
    const id = crypto.randomBytes(12).toString('hex');
    await fsp.mkdir(this.payloadRoot, { recursive: true });
    try {
      await moveAcrossVolumes(target, this.payloadPath(id));
    } catch (error) {
      throw fromNodeError(error, 'Could not move that item to the recycle bin');
    }

    const record: TrashRecord = {
      id,
      name: path.basename(target),
      originalPath: this.vault.relativize(target),
      rootId: this.runtime.get('activeRootId'),
      deletedAt: new Date().toISOString(),
      size,
      isDirectory,
    };
    await this.index.update(current => ({ items: [...current.items, record] }));
    return id;
  }

  /** Records whose payload went missing (bin edited from outside) are dropped. */
  async list(): Promise<{ items: TrashItem[]; totalSize: number }> {
    const rootId = this.runtime.get('activeRootId');
    const records = this.index.read().items.filter(record => record.rootId === rootId);

    const live: TrashRecord[] = [];
    for (const record of records) {
      if (await exists(this.payloadPath(record.id))) live.push(record);
    }
    if (live.length !== records.length) {
      const missing = new Set(
        records.filter(record => !live.includes(record)).map(record => record.id),
      );
      await this.index.update(current => ({
        items: current.items.filter(record => !missing.has(record.id)),
      }));
    }

    return {
      items: live
        .map(({ rootId: _rootId, ...item }) => item)
        .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)),
      totalSize: live.reduce((sum, record) => sum + record.size, 0),
    };
  }

  /** Returns both paths: a collision brings the item back as "name (2)", and Ledger must follow. */
  async restore(id: string): Promise<{ path: string; originalPath: string }> {
    const record = this.requireRecord(id);
    if (record.rootId !== this.runtime.get('activeRootId')) {
      throw HearthError.badRequest('That item belongs to a different root');
    }

    const parent = path.dirname(this.vault.resolve(record.originalPath));
    await fsp.mkdir(parent, { recursive: true });
    const destination = await resolveCollision(parent, record.name);
    try {
      await moveAcrossVolumes(this.payloadPath(id), destination);
    } catch (error) {
      throw fromNodeError(error, 'Could not restore that item');
    }

    await this.drop(new Set([id]));
    return { path: this.vault.relativize(destination), originalPath: record.originalPath };
  }

  async purge(id: string): Promise<void> {
    this.requireRecord(id);
    await this.drop(new Set([id]));
  }

  /** Only the active root's items. */
  async empty(): Promise<number> {
    const rootId = this.runtime.get('activeRootId');
    const doomed = new Set(
      this.index
        .read()
        .items.filter(record => record.rootId === rootId)
        .map(record => record.id),
    );
    await this.drop(doomed);
    return doomed.size;
  }

  /** Past the retention window first, then oldest-first until under the size cap. */
  async cleanup(): Promise<void> {
    const retentionDays = this.runtime.get('trashRetentionDays');
    const maxSizeBytes = this.runtime.get('trashMaxSizeMB') * MB;
    const records = [...this.index.read().items].sort((a, b) =>
      a.deletedAt.localeCompare(b.deletedAt),
    );
    const expiredBefore = Date.now() - retentionDays * DAY_MS;

    const doomed = new Set<string>();
    let retainedSize = 0;
    for (const record of records) {
      if (Date.parse(record.deletedAt) < expiredBefore) doomed.add(record.id);
      else retainedSize += record.size;
    }

    if (Number.isFinite(maxSizeBytes)) {
      for (const record of records) {
        if (retainedSize <= maxSizeBytes) break;
        if (doomed.has(record.id)) continue;
        doomed.add(record.id);
        retainedSize -= record.size;
      }
    }

    if (doomed.size === 0) return;
    await this.drop(doomed);
    this.logger.info({ removed: doomed.size }, 'recycle bin cleaned up');
  }

  private async drop(ids: Set<string>): Promise<void> {
    for (const id of ids) await fsp.rm(this.payloadPath(id), { recursive: true, force: true });
    await this.index.update(current => ({
      items: current.items.filter(record => !ids.has(record.id)),
    }));
  }

  private requireRecord(id: string): TrashRecord {
    const record = this.index.read().items.find(item => item.id === id);
    if (!record) throw HearthError.notFound('No such item in the recycle bin');
    return record;
  }

  private payloadPath(id: string): string {
    return path.join(this.payloadRoot, id);
  }
}
