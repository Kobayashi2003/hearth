import fsp from 'node:fs/promises';
import path from 'node:path';

import type { Logger } from 'pino';

import type { AppConfig } from '../../config/index.js';

interface CacheTarget {
  directory: string;
  maxAgeMs: number;
}

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Derived caches are disposable and pruned by age: a miss costs one re-render. */
export class CacheCleanupService {
  private timer: NodeJS.Timeout | null = null;
  private readonly targets: CacheTarget[];

  constructor(
    config: AppConfig,
    private readonly logger: Logger,
  ) {
    this.targets = [
      { directory: config.media.thumbnailCacheDirectory, maxAgeMs: config.cache.thumbnailMaxAgeMs },
      { directory: config.media.comicCacheDirectory, maxAgeMs: config.cache.comicMaxAgeMs },
      { directory: config.media.psdCacheDirectory, maxAgeMs: config.cache.psdMaxAgeMs },
      {
        directory: config.media.subtitleCacheDirectory,
        maxAgeMs: config.cache.subtitleMaxAgeMs,
      },
    ].filter(target => Number.isFinite(target.maxAgeMs));
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
    void this.sweep();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async sweep(): Promise<void> {
    for (const target of this.targets) {
      try {
        const removed = await pruneOlderThan(target.directory, Date.now() - target.maxAgeMs);
        if (removed > 0) {
          this.logger.info({ directory: path.basename(target.directory), removed }, 'cache pruned');
        }
      } catch (error) {
        this.logger.warn({ err: error, directory: target.directory }, 'cache sweep failed');
      }
    }
  }
}

/** Removes files last modified before `deadline`, then any directory left empty. */
async function pruneOlderThan(directory: string, deadline: number): Promise<number> {
  const entries = await fsp.readdir(directory, { withFileTypes: true }).catch(() => []);
  let removed = 0;
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    // Something removed concurrently is simply gone already.
    removed += await (
      entry.isDirectory() ? pruneFolder(target, deadline) : pruneFile(target, deadline)
    ).catch(() => 0);
  }
  return removed;
}

async function pruneFolder(folder: string, deadline: number): Promise<number> {
  const removed = await pruneOlderThan(folder, deadline);
  const remaining = await fsp.readdir(folder);
  if (remaining.length === 0) await fsp.rmdir(folder).catch(() => undefined);
  return removed;
}

async function pruneFile(file: string, deadline: number): Promise<number> {
  const stats = await fsp.stat(file);
  if (stats.mtimeMs >= deadline) return 0;
  await fsp.rm(file, { force: true });
  return 1;
}
