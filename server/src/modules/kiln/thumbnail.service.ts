import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';
import { COMIC_EXTENSIONS, EPUB_EXTENSIONS } from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import type { FfmpegAdapter } from '../../adapters/ffmpeg/ffmpeg.js';
import { mediaKindOf, mimeForPath } from '../../lib/mime.js';
import { runWorker } from '../../lib/worker-pool.js';
import type { SafePath } from '../../lib/vault.js';
import type { PsdRequest, PsdResponse } from '../../workers/psd.worker.js';
import type { CoverRequest, CoverResponse } from '../../workers/cover.worker.js';

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

  /**
   * A thumbnail, or null when this file simply has no picture in it.
   *
   * "Nothing to show" is an ordinary answer, not a failure: a BMP sharp cannot
   * read, a 176-byte AppleDouble stub with an `.epub` name, an MP3 with no
   * embedded art. Each of those used to surface as a 500 "Something went wrong",
   * which buried the errors that did matter under a wall of red.
   */
  async render(
    target: SafePath,
    request: ThumbnailRequest,
    signal?: AbortSignal,
  ): Promise<Buffer | null> {
    const stats = await fsp.stat(target);
    const cachePath = this.cachePathFor(target, stats.mtimeMs, stats.size, request);

    const cached = await fsp.readFile(cachePath).catch(() => null);
    if (cached) return cached;

    const source = await this.decodeSource(target, request, signal);
    if (!source) return null;

    let thumbnail: Buffer;
    try {
      thumbnail = await sharp(source, { animated: false })
        .rotate() // Honour the EXIF orientation tag rather than showing it sideways.
        .resize({ width: request.width, withoutEnlargement: true })
        .webp({ quality: request.quality })
        .toBuffer();
    } catch {
      // Unreadable or corrupt for whatever reason; the caller shows its glyph.
      return null;
    }

    await fsp.mkdir(path.dirname(cachePath), { recursive: true });
    // Write via a temp name so a concurrent reader never sees a partial file.
    const temporaryPath = `${cachePath}.${process.pid}.tmp`;
    await fsp.writeFile(temporaryPath, thumbnail);
    await fsp.rename(temporaryPath, cachePath);

    return thumbnail;
  }

  /** Decode whatever the source is into bytes sharp can resize, or null. */
  private async decodeSource(
    target: SafePath,
    request: ThumbnailRequest,
    signal?: AbortSignal,
  ): Promise<Buffer | null> {
    const mimeType = mimeForPath(target);
    const kind = mediaKindOf(mimeType);

    if (kind === 'video') {
      return this.ffmpeg.extractFrame(target, VIDEO_POSTER_SECONDS, request.width, signal);
    }

    // Music carries its own cover. Without this an album is a wall of identical
    // note glyphs, which is the one thing artwork exists to prevent.
    if (kind === 'audio') {
      return embeddedArtwork(target);
    }

    if (path.extname(target).toLowerCase() === '.psd') {
      const rendered = await runWorker<PsdRequest, PsdResponse>('psd', { filePath: target }, signal);
      return Buffer.from(rendered.png);
    }

    // A book's cover: page one for a comic, the declared cover image for an
    // EPUB. Read out of the archive without unpacking it — see cover.worker.
    const extension = path.extname(target).toLowerCase();
    const bookKind = COMIC_EXTENSIONS.has(extension)
      ? ('comic' as const)
      : EPUB_EXTENSIONS.has(extension)
        ? ('epub' as const)
        : null;

    if (bookKind) {
      // A file named `.epub` is not necessarily an archive — an AppleDouble
      // stub of 176 bytes carries the name and nothing else, and opening it
      // throws inside the worker. That is "no cover", not a server fault.
      const cover = await runWorker<CoverRequest, CoverResponse | null>(
        'cover',
        { archivePath: target, kind: bookKind },
        signal,
      ).catch(() => null);
      return cover ? Buffer.from(cover.content) : null;
    }

    if (kind !== 'image') return null;

    // GIFs are decoded like any other image. They used to be skipped as "too
    // expensive", but the pipeline already opens every source with
    // `animated: false`, so only the first frame is ever decoded — the cost the
    // exclusion was avoiding is not one that gets paid.
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

/**
 * The cover embedded in an audio file's tags, or null when it carries none.
 *
 * Only the metadata is parsed — `music-metadata` is told to skip the audio
 * stream — so this costs a header read rather than decoding the track.
 */
async function embeddedArtwork(target: SafePath): Promise<Buffer | null> {
  try {
    const { parseFile } = await import('music-metadata');
    const metadata = await parseFile(target, { duration: false, skipCovers: false });
    const picture = metadata.common.picture?.[0];
    return picture ? Buffer.from(picture.data) : null;
  } catch {
    // A tagless or malformed file is not an error; it just has no picture.
    return null;
  }
}
