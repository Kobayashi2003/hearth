import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { isTextSubtitle } from '@hearth/shared';

import type { FfmpegAdapter } from '../../adapters/ffmpeg/ffmpeg.js';
import type { AppConfig } from '../../config/index.js';
import { HearthError } from '../../lib/errors.js';
import type { SafePath } from '../../lib/vault.js';

/**
 * Subtitles as WebVTT, cached on disk. Extracting a track reads the whole file,
 * so the first request takes every text track at once.
 */
export class SubtitleService {
  /** One extraction per file version, shared by every request waiting on it. */
  private readonly pending = new Map<string, Promise<void>>();

  constructor(
    private readonly config: AppConfig,
    private readonly ffmpeg: FfmpegAdapter,
  ) {}

  async vtt(target: SafePath, track: number, signal?: AbortSignal): Promise<string> {
    const stats = await fsp.stat(target);
    const key = crypto
      .createHash('sha1')
      .update(`${target}|${stats.mtimeMs}|${stats.size}`)
      .digest('hex');
    const directory = path.join(this.config.media.subtitleCacheDirectory, key.slice(0, 2), key);
    const file = path.join(directory, `${track}.vtt`);

    const cached = await fsp.readFile(file, 'utf8').catch(() => null);
    if (cached !== null) return cached;

    let job = this.pending.get(key);
    if (!job) {
      // Not tied to the request: a viewer that gives up still leaves the cache filled.
      job = this.extractAll(target, directory).finally(() => this.pending.delete(key));
      this.pending.set(key, job);
    }
    await abandonable(job, signal);

    const extracted = await fsp.readFile(file, 'utf8').catch(() => null);
    if (extracted === null) throw HearthError.notFound('That subtitle track cannot be shown');
    return extracted;
  }

  private async extractAll(target: SafePath, directory: string): Promise<void> {
    const probe = await this.ffmpeg.probe(target);
    const tracks = probe.subtitleTracks.filter(track => isTextSubtitle(track.codec));
    if (tracks.length === 0) return;

    // Written beside the final directory and renamed in, so a half-written set is never served.
    const staging = `${directory}.${process.pid}.tmp`;
    await fsp.mkdir(staging, { recursive: true });
    try {
      await this.ffmpeg.extractSubtitles(
        target,
        tracks.map(track => ({
          track: track.index,
          file: path.join(staging, `${track.index}.vtt`),
        })),
      );
      await fsp.rm(directory, { recursive: true, force: true });
      await fsp.rename(staging, directory);
    } finally {
      await fsp.rm(staging, { recursive: true, force: true });
    }
  }
}

/** Waits for a shared job, but lets one waiter leave without cancelling it for the rest. */
function abandonable(job: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!signal) return job;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('The request was aborted', 'AbortError'));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    job.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
