import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import type { AppConfig } from '../../config/index.js';
import type { FfmpegAdapter } from '../../adapters/ffmpeg/ffmpeg.js';
import { HearthError } from '../../lib/errors.js';
import { mediaKindOf, mimeForPath } from '../../lib/mime.js';
import { runWorker } from '../../lib/worker-pool.js';
import type { SafePath } from '../../lib/vault.js';
import type { PsdRequest, PsdResponse } from '../../workers/psd.worker.js';

export interface ThumbnailRequest {
  width: number;
  quality: number;
}

/** Where in a video to grab the poster frame — far enough in to skip black leader. */
const VIDEO_POSTER_SECONDS = 3;

/**
 * Thumbnails are generated once and cached on disk. The cache key includes the
 * source's mtime and size, so an edited file produces a new key rather than
 * serving a stale image, and no invalidation pass is ever needed.
 */
export class ThumbnailService {
  constructor(
    private readonly config: AppConfig,
    private readonly ffmpeg: FfmpegAdapter,
  ) {}

  async render(target: SafePath, request: ThumbnailRequest, signal?: AbortSignal): Promise<Buffer> {
    const stats = await fsp.stat(target);
    const cachePath = this.cachePathFor(target, stats.mtimeMs, stats.size, request);

    const cached = await fsp.readFile(cachePath).catch(() => null);
    if (cached) return cached;

    const source = await this.decodeSource(target, request, signal);
    const thumbnail = await sharp(source, { animated: false })
      .rotate() // Honour the EXIF orientation tag rather than showing it sideways.
      .resize({ width: request.width, withoutEnlargement: true })
      .webp({ quality: request.quality })
      .toBuffer();

    await fsp.mkdir(path.dirname(cachePath), { recursive: true });
    // Write via a temp name so a concurrent reader never sees a partial file.
    const temporaryPath = `${cachePath}.${process.pid}.tmp`;
    await fsp.writeFile(temporaryPath, thumbnail);
    await fsp.rename(temporaryPath, cachePath);

    return thumbnail;
  }

  /** Decode whatever the source is into bytes sharp can resize. */
  private async decodeSource(
    target: SafePath,
    request: ThumbnailRequest,
    signal?: AbortSignal,
  ): Promise<Buffer> {
    const mimeType = mimeForPath(target);
    const kind = mediaKindOf(mimeType);

    if (kind === 'video') {
      return this.ffmpeg.extractFrame(target, VIDEO_POSTER_SECONDS, request.width, signal);
    }

    if (path.extname(target).toLowerCase() === '.psd') {
      const rendered = await runWorker<PsdRequest, PsdResponse>('psd', { filePath: target }, signal);
      return Buffer.from(rendered.png);
    }

    if (kind !== 'image') {
      throw HearthError.badRequest('That file type has no thumbnail');
    }

    // An animated GIF is expensive to decode; skip it unless asked for.
    if (mimeType === 'image/gif' && !this.config.media.thumbnailForAnimatedGif) {
      throw HearthError.badRequest('Thumbnails for animated GIFs are disabled');
    }

    return fsp.readFile(target);
  }

  private cachePathFor(
    target: string,
    mtimeMs: number,
    size: number,
    request: ThumbnailRequest,
  ): string {
    const key = crypto
      .createHash('sha1')
      .update(`${target}|${mtimeMs}|${size}|${request.width}|${request.quality}`)
      .digest('hex');
    // Two-level fan-out keeps any one directory small enough to list quickly.
    return path.join(this.config.media.thumbnailCacheDirectory, key.slice(0, 2), `${key}.webp`);
  }
}
