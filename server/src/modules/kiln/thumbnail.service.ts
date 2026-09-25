import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';
import { COMIC_EXTENSIONS, EPUB_EXTENSIONS } from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import type { FfmpegAdapter } from '../../adapters/ffmpeg/ffmpeg.js';
import { mediaKindOf, mimeForPath } from '../../lib/mime.js';
import { runWorker } from '../../lib/worker.js';
import type { SafePath } from '../../lib/vault.js';
import type { PsdRequest, PsdResponse } from '../../workers/psd.worker.js';
import type { CoverRequest, CoverResponse } from '../../workers/cover.worker.js';

export interface ThumbnailRequest {
  width: number;
  quality: number;
}

/** Far enough in to skip black leader. */
const VIDEO_POSTER_SECONDS = 3;

/** Cached on disk under a key that includes mtime and size, so edits never serve a stale image. */
export class ThumbnailService {
  constructor(
    private readonly config: AppConfig,
    private readonly ffmpeg: FfmpegAdapter,
  ) {}

  /** Null when the file has no picture in it (no embedded art, unreadable image, AppleDouble stub…). */
  async render(
    target: SafePath,
    request: ThumbnailRequest,
    signal?: AbortSignal,
  ): Promise<Buffer | null> {
    const stats = await fsp.stat(target);
    const cachePath = this.cachePathFor(target, stats.mtimeMs, stats.size, request);

    const cached = await fsp.readFile(cachePath).catch(() => null);
    if (cached) return cached;

    const source = await this.decodeSource(target, stats.size, request, signal);
    if (!source) return null;

    let thumbnail: Buffer;
    try {
      thumbnail = await sharp(source, { animated: false })
        .rotate() // EXIF orientation
        .resize({ width: request.width, withoutEnlargement: true })
        .webp({ quality: request.quality })
        .toBuffer();
    } catch {
      return null;
    }

    await fsp.mkdir(path.dirname(cachePath), { recursive: true });
    const temporaryPath = `${cachePath}.${process.pid}.tmp`;
    await fsp.writeFile(temporaryPath, thumbnail);
    await fsp.rename(temporaryPath, cachePath);

    return thumbnail;
  }

  /** Decode whatever the source is into bytes sharp can resize, or null. */
  private async decodeSource(
    target: SafePath,
    size: number,
    request: ThumbnailRequest,
    signal?: AbortSignal,
  ): Promise<Buffer | null> {
    const mimeType = mimeForPath(target, size);
    const kind = mediaKindOf(mimeType);

    if (kind === 'video') {
      return this.ffmpeg.extractFrame(target, VIDEO_POSTER_SECONDS, request.width, signal);
    }

    if (kind === 'audio') {
      return embeddedArtwork(target);
    }

    if (path.extname(target).toLowerCase() === '.psd') {
      const rendered = await runWorker<PsdRequest, PsdResponse>(
        'psd',
        { filePath: target },
        signal,
      );
      return Buffer.from(rendered.png);
    }

    const extension = path.extname(target).toLowerCase();
    const bookKind = COMIC_EXTENSIONS.has(extension)
      ? ('comic' as const)
      : EPUB_EXTENSIONS.has(extension)
        ? ('epub' as const)
        : null;

    if (bookKind) {
      // A worker failure here means "not really an archive", i.e. no cover.
      const cover = await runWorker<CoverRequest, CoverResponse | null>(
        'cover',
        { archivePath: target, kind: bookKind },
        signal,
      ).catch(() => null);
      return cover ? Buffer.from(cover.content) : null;
    }

    if (kind !== 'image') return null;

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
    return path.join(this.config.media.thumbnailCacheDirectory, key.slice(0, 2), `${key}.webp`);
  }
}

/** The cover embedded in an audio file's tags; only the metadata is parsed. */
async function embeddedArtwork(target: SafePath): Promise<Buffer | null> {
  try {
    const { parseFile } = await import('music-metadata');
    const metadata = await parseFile(target, { duration: false, skipCovers: false });
    const picture = metadata.common.picture?.[0];
    return picture ? Buffer.from(picture.data) : null;
  } catch {
    return null;
  }
}
