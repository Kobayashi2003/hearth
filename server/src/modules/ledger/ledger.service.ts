import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

import type { Progress, ProgressMap } from '@hearth/shared';

import { HearthError } from '../../lib/errors.js';
import { readJsonFile, UserDocuments, writeJsonFileAtomic } from '../../lib/json-store.js';
import { isUnder, type PathFollower } from '../../lib/path-follower.js';

export interface LedgerLimits {
  maxProgressEntries: number;
  maxSessions: number;
  /** A reading session holds a locator, preferences and marks. */
  maxSessionBytes: number;
}

const UNLIMITED: LedgerLimits = {
  maxProgressEntries: Number.POSITIVE_INFINITY,
  maxSessions: Number.POSITIVE_INFINITY,
  maxSessionBytes: Number.POSITIVE_INFINITY,
};

interface StoredSession {
  record: unknown;
  savedAt: number;
}

type SessionMap = Record<string, StoredSession>;

/**
 * Ledger: per user, where each file was left. Keyed by root-relative path, so
 * `reprefix` / `forget` must be called whenever Hearth itself moves or deletes
 * something (see the backend structure doc for why not a content hash). Each
 * root keeps its own, under `<kind>/<root id>/`: the same path in two roots is
 * two unrelated files.
 */
export class LedgerService implements PathFollower {
  private readonly stores = new Map<
    string,
    { progress: UserDocuments<ProgressMap>; sessions: UserDocuments<SessionMap> }
  >();

  constructor(
    private readonly directory: string,
    private readonly limits: LedgerLimits = UNLIMITED,
    /** The root served now; everything here acts on its ledger. */
    private readonly rootId: () => string = () => 'default',
  ) {}

  private get progress(): UserDocuments<ProgressMap> {
    return this.storesFor(this.rootId()).progress;
  }

  private get sessions(): UserDocuments<SessionMap> {
    return this.storesFor(this.rootId()).sessions;
  }

  private storesFor(rootId: string) {
    let stores = this.stores.get(rootId);
    if (!stores) {
      const folder = rootFolderName(rootId);
      stores = {
        progress: new UserDocuments(path.join(this.directory, 'progress', folder), () => ({})),
        sessions: new UserDocuments(path.join(this.directory, 'sessions', folder), () => ({})),
      };
      this.stores.set(rootId, stores);
    }
    return stores;
  }

  /**
   * Pre-2.0 ledgers (`<user>.json` holding `{ progress, recent, pinned }`) and
   * ledgers from before roots had their own (`progress/<user>.json`,
   * `sessions/<user>.json`) are given to the root served when they are found:
   * which root they were written in was never recorded.
   */
  async migrate(): Promise<void> {
    const folder = rootFolderName(this.rootId());
    const names = await fsp.readdir(this.directory).catch(() => [] as string[]);
    for (const name of names.filter(candidate => candidate.endsWith('.json'))) {
      const legacyPath = path.join(this.directory, name);
      const legacy = readJsonFile<{ progress?: ProgressMap }>(legacyPath);
      const target = path.join(this.directory, 'progress', folder, name);
      if (legacy?.progress && readJsonFile(target) === null) {
        await writeJsonFileAtomic(target, legacy.progress);
      }
      await fsp.rm(legacyPath, { force: true });
    }
    for (const kind of ['progress', 'sessions']) {
      const kindDirectory = path.join(this.directory, kind);
      const files = await fsp.readdir(kindDirectory).catch(() => [] as string[]);
      for (const name of files.filter(candidate => candidate.endsWith('.json'))) {
        const unscoped = path.join(kindDirectory, name);
        const target = path.join(kindDirectory, folder, name);
        await fsp.mkdir(path.dirname(target), { recursive: true });
        if (readJsonFile(target) === null) await fsp.rename(unscoped, target);
        else await fsp.rm(unscoped, { force: true });
      }
    }
  }

  readProgress(username: string): ProgressMap {
    return this.progress.for(username).read();
  }

  async patchProgress(
    username: string,
    patch: Record<string, Progress | null>,
  ): Promise<ProgressMap> {
    return this.progress.for(username).update(current => {
      // Built through a Map: keys are client-chosen paths, and `obj[key] = …`
      // with a key like "__proto__" would change the prototype instead of storing.
      const next = new Map(Object.entries(current));
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      return newest(
        Object.fromEntries(next),
        this.limits.maxProgressEntries,
        value => value.savedAt,
      );
    });
  }

  readSession(username: string, filePath: string): unknown {
    const sessions = this.sessions.for(username).read();
    return Object.hasOwn(sessions, filePath) ? (sessions[filePath]?.record ?? null) : null;
  }

  async saveSession(username: string, filePath: string, record: unknown): Promise<void> {
    if (JSON.stringify(record).length > this.limits.maxSessionBytes) {
      throw new HearthError('PAYLOAD_TOO_LARGE', 'That reading session is too large to store');
    }
    await this.sessions
      .for(username)
      .update(current =>
        newest(
          { ...current, [filePath]: { record, savedAt: Date.now() } },
          this.limits.maxSessions,
          value => value.savedAt,
        ),
      );
  }

  async removeSession(username: string, filePath: string): Promise<void> {
    await this.sessions.for(username).update(current => {
      const { [filePath]: _removed, ...rest } = current;
      return rest;
    });
  }

  /** Follow a move in the root served, for every user; a directory rename rewrites every path beneath it. */
  async reprefix(from: string, to: string): Promise<void> {
    if (from === to) return;
    await this.rewriteAll(key => (isUnder(key, from) ? to + key.slice(from.length) : key));
  }

  /** Drop everything under a path that no longer exists. */
  async forget(target: string): Promise<void> {
    await this.rewriteAll(key => (isUnder(key, target) ? null : key));
  }

  private async rewriteAll(rewrite: (key: string) => string | null): Promise<void> {
    for (const store of [this.progress, this.sessions] as Array<
      UserDocuments<Record<string, unknown>>
    >) {
      for (const username of await store.usernames()) {
        try {
          await store.for(username).update(current => remap(current, rewrite));
        } catch {
          // Positions are a convenience; losing one user's must not fail the
          // file operation that already succeeded on disk.
        }
      }
    }
  }
}

/** A root id as a folder name: kept as it is when it is already a safe one. */
function rootFolderName(rootId: string): string {
  return /^[A-Za-z0-9_-]{1,64}$/.test(rootId)
    ? rootId
    : crypto.createHash('sha1').update(rootId).digest('hex');
}

function remap<T>(
  current: Record<string, T>,
  rewrite: (key: string) => string | null,
): Record<string, T> {
  const next = new Map<string, T>();
  for (const [key, value] of Object.entries(current)) {
    const target = rewrite(key);
    if (target !== null) next.set(target, value);
  }
  return Object.fromEntries(next);
}

function newest<T>(
  map: Record<string, T>,
  limit: number,
  savedAt: (value: T) => number,
): Record<string, T> {
  const entries = Object.entries(map);
  if (entries.length <= limit) return map;
  entries.sort(([, a], [, b]) => savedAt(b) - savedAt(a));
  return Object.fromEntries(entries.slice(0, limit));
}
