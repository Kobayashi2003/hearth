import { execFileSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FfmpegAdapter } from '../../server/src/adapters/ffmpeg/ffmpeg.js';
import type { AppConfig } from '../../server/src/config/index.js';
import { SharedJobs } from '../../server/src/lib/shared-jobs.js';
import type { SafePath } from '../../server/src/lib/vault.js';
import { ThumbnailService } from '../../server/src/modules/kiln/thumbnail.service.js';

let directory: string;
beforeEach(async () => {
  directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'hearth-thumbs-'));
});
afterEach(() => fsp.rm(directory, { recursive: true, force: true }));

const isWebp = (bytes: Buffer | null) =>
  bytes !== null &&
  bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
  bytes.subarray(8, 12).toString('latin1') === 'WEBP';

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => (release = resolve));
  return { promise, release };
}

const TINY_JPEG = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: '#c33' } })
    .jpeg()
    .toBuffer();

function service(ffmpeg: FfmpegAdapter): ThumbnailService {
  const config = {
    media: { thumbnailCacheDirectory: path.join(directory, 'cache'), framePreviewPoints: 100 },
  };
  return new ThumbnailService(config as AppConfig, ffmpeg);
}

describe('thumbnails asked for at once', () => {
  it('draws one picture once for every request, and each gets a thumbnail', async () => {
    const picture = path.join(directory, 'picture.png') as SafePath;
    await sharp({ create: { width: 500, height: 500, channels: 3, background: '#f00' } })
      .png()
      .toFile(picture);
    const thumbnails = service({} as FfmpegAdapter);

    const answers = await Promise.all(
      Array.from({ length: 8 }, () => thumbnails.render(picture, { width: 100, quality: 70 })),
    );

    expect(answers.every(isWebp)).toBe(true);
    const cached = await fsp.readdir(path.join(directory, 'cache'), { recursive: true });
    // One thumbnail, and no temporary file left beside it.
    expect(cached.filter(name => name.endsWith('.webp'))).toHaveLength(1);
    expect(cached.filter(name => name.endsWith('.tmp'))).toEqual([]);
  });

  it('decodes no more than two videos at a time', async () => {
    const videos = await Promise.all(
      Array.from({ length: 5 }, async (_, index) => {
        const file = path.join(directory, `clip${index}.mp4`) as SafePath;
        await fsp.writeFile(file, `film ${index}`);
        return file;
      }),
    );
    const release = deferred();
    let running = 0;
    let most = 0;
    const jpeg = await TINY_JPEG();
    const ffmpeg = {
      probe: async () => ({ durationSeconds: 60 }),
      async extractFrame() {
        running += 1;
        most = Math.max(most, running);
        await release.promise;
        running -= 1;
        return jpeg;
      },
    } as unknown as FfmpegAdapter;
    const thumbnails = service(ffmpeg);

    const answers = Promise.all(
      videos.map(video => thumbnails.render(video, { width: 320, quality: 70 })),
    );
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(running).toBe(2);
    release.release();

    expect((await answers).every(isWebp)).toBe(true);
    expect(most).toBe(2);
  });
});

describe('SharedJobs', () => {
  it('keeps the work going while anyone still waits, and stops it once all have left', async () => {
    const jobs = new SharedJobs<string>();
    const finish = deferred();
    let stopped = false;
    const job = async (signal: AbortSignal) => {
      signal.addEventListener('abort', () => (stopped = true));
      await finish.promise;
      return 'done';
    };
    const first = new AbortController();
    const second = new AbortController();
    const third = new AbortController();

    const leaving = jobs.run('key', job, first.signal);
    const staying = jobs.run('key', job, second.signal);
    first.abort();
    await expect(leaving).rejects.toMatchObject({ code: 'ABORTED' });
    expect(stopped).toBe(false);
    finish.release();
    expect(await staying).toBe('done');

    const alone = jobs.run('other', () => new Promise<string>(() => undefined), third.signal);
    third.abort();
    await expect(alone).rejects.toMatchObject({ code: 'ABORTED' });
  });
});

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.runIf(hasFfmpeg)('ffmpeg', () => {
  const adapter = () =>
    new FfmpegAdapter({
      ffmpegPath: 'ffmpeg',
      ffprobePath: 'ffprobe',
      preset: 'ultrafast',
      crf: 30,
    });

  it('keeps a transcode flowing however much ffmpeg writes to stderr', async () => {
    // Half a megabyte of tags, which ffmpeg prints as it opens the file: far past a pipe's buffer.
    const metadata = path.join(directory, 'tags.txt');
    const tags = Array.from({ length: 512 }, (_, index) => `tag${index}=${'x'.repeat(1024)}`);
    await fsp.writeFile(metadata, `;FFMETADATA1\n${tags.join('\n')}\n`);
    const video = path.join(directory, 'noisy.mkv');
    execFileSync('ffmpeg', [
      ...['-v', 'quiet', '-f', 'lavfi', '-i', 'testsrc=size=16x16:rate=10:duration=1'],
      ...['-i', metadata, '-map_metadata', '1', '-c:v', 'libx264', video],
    ]);

    const controller = new AbortController();
    const stream = adapter().transcode(video, {}, controller.signal);
    const chunks: Buffer[] = [];
    const ended = new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.once('end', resolve);
      stream.once('error', reject);
    });
    const timeout = setTimeout(() => controller.abort(), 10_000);
    await ended;
    clearTimeout(timeout);

    expect(controller.signal.aborted).toBe(false);
    expect(Buffer.concat(chunks).length).toBeGreaterThan(0);
  }, 20_000);

  it('takes a poster from a large video', async () => {
    const video = path.join(directory, 'wide.mkv');
    execFileSync('ffmpeg', [
      ...['-v', 'quiet', '-f', 'lavfi', '-i', 'testsrc=size=3840x2160:rate=30:duration=3'],
      ...['-c:v', 'libx264', '-preset', 'ultrafast', video],
    ]);
    const jpeg = await adapter().extractFrame(video, { atSeconds: 0.5, width: 320 });
    const { width } = await sharp(jpeg).metadata();
    expect(width).toBe(320);
  }, 30_000);
});
