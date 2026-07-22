import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { COMIC_EXTENSIONS, type ComicManifest } from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import { HearthError } from '../../lib/errors.js';
import { runWorker } from '../../lib/worker-pool.js';
import type { SafePath } from '../../lib/vault.js';
import type { ComicRequest, ComicResponse } from '../../workers/comic.worker.js';

interface CachedComic {
  key: string;
  pages: string[];
}

const MANIFEST_FILENAME = 'pages.json';

/**
 * Comic archives are unpacked once into a cache directory keyed by content
 * identity, and pages are served from there afterwards. Paging through a
 * 300-page volume then costs one file read per page instead of re-opening and
 * re-scanning the archive each time.
 */
export class ComicService {
  /** De-duplicates concurrent extraction of the same archive. */
  private readonly extracting = new Map<string, Promise<CachedComic>>();

  constructor(private readonly config: AppConfig) {}

  async open(target: SafePath, signal?: AbortSignal): Promise<ComicManifest> {
    if (!COMIC_EXTENSIONS.has(path.extname(target).toLowerCase())) {
      throw HearthError.badRequest('That file is not a comic archive');
    }

    const stats = await fsp.stat(target);
    const key = cacheKeyFor(target, stats.mtimeMs, stats.size);

    const cached = await this.readManifest(key);
    if (cached) return { key, pageCount: cached.pages.length, pages: cached.pages };

    const extraction = this.extracting.get(key) ?? this.extract(target, key, signal);
    this.extracting.set(key, extraction);

    try {
      const comic = await extraction;
      return { key: comic.key, pageCount: comic.pages.length, pages: comic.pages };
    } finally {
      this.extracting.delete(key);
    }
  }

  /**
   * Resolve one page to a filesystem path. The page name is checked against the
   * manifest rather than trusted, so the cache key cannot be combined with a
   * crafted page name to read an arbitrary file.
   */
  async pagePath(key: string, pageName: string): Promise<string> {
    assertCacheKey(key);

    const manifest = await this.readManifest(key);
    if (!manifest) throw HearthError.notFound('That comic is no longer open');
    if (!manifest.pages.includes(pageName)) throw HearthError.notFound('No such page');

    return path.join(this.directoryFor(key), pageName);
  }

  private async extract(target: SafePath, key: string, signal?: AbortSignal): Promise<CachedComic> {
    const cacheDirectory = this.directoryFor(key);
    const request: ComicRequest = { archivePath: target, cacheDirectory };

    const { pages } = await runWorker<ComicRequest, ComicResponse>('comic', request, signal);
    if (pages.length === 0) {
      await fsp.rm(cacheDirectory, { recursive: true, force: true });
      throw HearthError.badRequest('That archive contains no readable pages');
    }

    const manifest: CachedComic = { key, pages };
    await fsp.writeFile(path.join(cacheDirectory, MANIFEST_FILENAME), JSON.stringify(manifest));
    return manifest;
  }

  private async readManifest(key: string): Promise<CachedComic | null> {
    try {
      const raw = await fsp.readFile(path.join(this.directoryFor(key), MANIFEST_FILENAME), 'utf8');
      return JSON.parse(raw) as CachedComic;
    } catch {
      return null;
    }
  }

  private directoryFor(key: string): string {
    return path.join(this.config.media.comicCacheDirectory, key);
  }
}

function cacheKeyFor(target: string, mtimeMs: number, size: number): string {
  return crypto.createHash('sha1').update(`${target}|${mtimeMs}|${size}`).digest('hex');
}

const CACHE_KEY_PATTERN = /^[0-9a-f]{40}$/;

function assertCacheKey(key: string): void {
  if (!CACHE_KEY_PATTERN.test(key)) throw HearthError.badRequest('Invalid comic key');
}
