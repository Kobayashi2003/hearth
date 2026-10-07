import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import {
  COMIC_EXTENSIONS,
  EPUB_EXTENSIONS,
  KINDLE_EXTENSIONS,
  THUMBNAIL_REVISION,
} from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import type { FfmpegAdapter } from '../../adapters/ffmpeg/ffmpeg.js';
import { Gate } from '../../lib/gate.js';
import { mediaKindOf, mimeForPath } from '../../lib/mime.js';
import { runWorker } from '../../lib/worker.js';
import type { SafePath } from '../../lib/vault.js';
import type { PsdRequest, PsdResponse } from '../../workers/psd.worker.js';
import type { CoverRequest, CoverResponse } from '../../workers/cover.worker.js';

export interface ThumbnailRequest {
  width: number;
  quality: number;
}

/** Poster offset: past the opening logos, capped so a long file never seeks far. */
const POSTER_FRACTION = 0.15;
const POSTER_MIN_SECONDS = 3;
const POSTER_MAX_SECONDS = 600;

/** Cached on disk under a key that includes mtime and size, so edits never serve a stale image. */
export class ThumbnailService {
  /**
   * Decoding is CPU work (sharp, ffmpeg, a worker per book); a folder of
   * thousands asks for it all at once. Half the cores: the rest stay free for
   * what someone is watching, often a video decoded on this same machine.
   */
  private readonly decoding = new Gate(Math.max(2, Math.floor(os.availableParallelism() / 2)));

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

    const thumbnail = await this.decoding.run(
      () => this.draw(target, stats.size, request, signal),
      signal,
    );
    if (!thumbnail) return null;

    await fsp.mkdir(path.dirname(cachePath), { recursive: true });
    const temporaryPath = `${cachePath}.${process.pid}.tmp`;
    await fsp.writeFile(temporaryPath, thumbnail);
    await fsp.rename(temporaryPath, cachePath);

    return thumbnail;
  }

  private async draw(
    target: SafePath,
    size: number,
    request: ThumbnailRequest,
    signal?: AbortSignal,
  ): Promise<Buffer | null> {
    const source = await this.decodeSource(target, size, request, signal);
    if (!source) return null;
    try {
      return await sharp(source, { animated: false })
        .rotate() // EXIF orientation
        .resize({ width: request.width, withoutEnlargement: true })
        .webp({ quality: request.quality })
        .toBuffer();
    } catch {
      return null;
    }
  }

  /** Decode whatever the source is into bytes sharp can resize, or null. */
  private async decodeSource(
    target: SafePath,
    size: number,
    request: ThumbnailRequest,
    signal?: AbortSignal,
  ): Promise<Buffer | null> {
    const kind = mediaKindOf(mimeForPath(target, size));
    const extension = path.extname(target).toLowerCase();
    if (kind === 'video') return this.posterFrame(target, request.width, signal);
    if (kind === 'audio') return audioArtwork(target);
    if (extension === '.psd') return renderPsd(target, signal);
    const book = bookKindOf(extension);
    if (book) return bookCover(target, book, signal);
    return kind === 'image' ? fsp.readFile(target) : null;
  }

  /**
   * A frame past the opening logos (a clip shorter than the minimum offset is
   * taken from its middle), or the very first frame if that one fails.
   */
  private async posterFrame(target: SafePath, width: number, signal?: AbortSignal) {
    const duration = await this.ffmpeg
      .probe(target, signal)
      .then(probe => probe.durationSeconds)
      .catch(() => null);
    const at =
      duration === null
        ? POSTER_MIN_SECONDS
        : Math.min(
            POSTER_MAX_SECONDS,
            Math.max(Math.min(POSTER_MIN_SECONDS, duration / 2), duration * POSTER_FRACTION),
          );
    const frame = await this.ffmpeg
      .extractFrame(target, at, width, signal)
      .catch(() => Buffer.alloc(0));
    return frame.length > 0 ? frame : this.ffmpeg.extractFrame(target, 0, width, signal);
  }
  /**
   * An HTTP validator for the thumbnail of `target`: the disk cache key, which
   * already changes with the absolute path (so two roots never share one), the
   * file's mtime and size, and the requested dimensions.
   */
  async etag(target: SafePath, request: ThumbnailRequest): Promise<string> {
    const stats = await fsp.stat(target);
    return `"${this.keyFor(target, stats.mtimeMs, stats.size, request)}"`;
  }

  private keyFor(target: string, mtimeMs: number, size: number, request: ThumbnailRequest): string {
    return crypto
      .createHash('sha1')
      .update(
        `${THUMBNAIL_REVISION}|${target}|${mtimeMs}|${size}|${request.width}|${request.quality}`,
      )
      .digest('hex');
  }

  private cachePathFor(
    target: string,
    mtimeMs: number,
    size: number,
    request: ThumbnailRequest,
  ): string {
    const key = this.keyFor(target, mtimeMs, size, request);
    return path.join(this.config.media.thumbnailCacheDirectory, key.slice(0, 2), `${key}.webp`);
  }
}

type BookKind = CoverRequest['kind'];

function bookKindOf(extension: string): BookKind | null {
  if (COMIC_EXTENSIONS.has(extension)) return 'comic';
  if (EPUB_EXTENSIONS.has(extension)) return 'epub';
  if (KINDLE_EXTENSIONS.has(extension)) return 'kindle';
  return null;
}

/** A worker failure here means "not really an archive", i.e. no cover. */
async function bookCover(target: SafePath, kind: BookKind, signal?: AbortSignal) {
  const cover = await runWorker<CoverRequest, CoverResponse | null>(
    'cover',
    { archivePath: target, kind },
    signal,
  ).catch(() => null);
  return cover ? Buffer.from(cover.content) : null;
}

async function renderPsd(target: SafePath, signal?: AbortSignal): Promise<Buffer> {
  const rendered = await runWorker<PsdRequest, PsdResponse>('psd', { filePath: target }, signal);
  return Buffer.from(rendered.png);
}

/** Art in the file's tags, else the album's scans beside it. */
async function audioArtwork(target: SafePath): Promise<Buffer | null> {
  const embedded = await embeddedArtwork(target);
  if (embedded) return embedded;
  const scan = await albumArtwork(path.dirname(target));
  return scan ? fsp.readFile(scan) : null;
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

/** Names a rip or a download gives its front cover. */
const COVER_NAME = /^(cover|folder|front|jacket|album|albumart)\b/i;
/** Subfolders where the scans of the packaging usually live. */
const SCANS_FOLDER = /^(scans?|artwork|art|covers?|booklet|bk|images?)$/i;
const ARTWORK_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);
const albumCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Art kept beside the audio: a cover-named image, then a scans folder, then any image. */
async function albumArtwork(directory: string): Promise<string | null> {
  const dirents = await fsp.readdir(directory, { withFileTypes: true }).catch(() => null);
  if (!dirents) return null;
  const sorted = dirents.sort((a, b) => albumCollator.compare(a.name, b.name));
  const images = (entries: typeof sorted) =>
    entries.filter(
      dirent => dirent.isFile() && ARTWORK_EXTENSIONS.has(path.extname(dirent.name).toLowerCase()),
    );

  const here = images(sorted);
  const named = here.find(dirent => COVER_NAME.test(dirent.name));
  if (named) return path.join(directory, named.name);

  for (const folder of sorted.filter(d => d.isDirectory() && SCANS_FOLDER.test(d.name))) {
    const inside = await fsp
      .readdir(path.join(directory, folder.name), { withFileTypes: true })
      .catch(() => null);
    if (!inside) continue;
    const scans = images(inside.sort((a, b) => albumCollator.compare(a.name, b.name)));
    const pick = scans.find(dirent => COVER_NAME.test(dirent.name)) ?? scans[0];
    if (pick) return path.join(directory, folder.name, pick.name);
  }

  return here[0] ? path.join(directory, here[0].name) : null;
}
