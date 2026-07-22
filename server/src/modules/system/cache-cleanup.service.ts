import fsp from 'node:fs/promises';
import path from 'node:path';

import type { Logger } from 'pino';

import type { AppConfig } from '../../config/index.js';

interface CacheTarget {
  directory: string;
  maxAgeMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Derived caches are disposable: everything under them can be regenerated from
 * the source file. They are pruned by age rather than by size, because the cost
 * of a miss is one re-render, and the risk of unbounded growth on a personal
 * machine is a full disk.
 */
export class CacheCleanupService {
  private timer: NodeJS.Timeout | null = null;
  private readonly targets: CacheTarget[];

  constructor(
    config: AppConfig,
    private readonly logger: Logger,
  ) {
    this.targets = [
      { directory: config.media.thumbnailCacheDirectory, maxAgeMs: 30 * DAY_MS },
      // Comics and PSD renders are large; a shorter window keeps the footprint down.
      { directory: config.media.comicCacheDirectory, maxAgeMs: 7 * DAY_MS },
      { directory: config.media.psdCacheDirectory, maxAgeMs: 7 * DAY_MS },
    ];
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

/**
 * Remove entries last modified before `deadline`. Directories are treated as a
 * unit — a comic's page directory is either kept whole or dropped whole, since
 * a half-pruned comic would render with missing pages.
 */
async function pruneOlderThan(directory: string, deadline: number): Promise<number> {
  let entries;
  try {
    entries = await fsp.readdir(directory, { withFileTypes: true });
  } catch {
    return 0;
  }

  let removed = 0;
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    try {
      if (entry.isDirectory()) {
        // Recurse first so a fan-out directory of files is pruned individually.
        removed += await pruneOlderThan(target, deadline);
        const remaining = await fsp.readdir(target);
        if (remaining.length === 0) await fsp.rmdir(target).catch(() => undefined);
        continue;
      }

      const stats = await fsp.stat(target);
      if (stats.mtimeMs < deadline) {
        await fsp.rm(target, { force: true });
        removed += 1;
      }
    } catch {
      // A cache entry removed by another sweep or by hand is not an error.
    }
  }

  return removed;
}
