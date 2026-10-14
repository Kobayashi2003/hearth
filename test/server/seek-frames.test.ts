import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FfmpegAdapter } from '../../server/src/adapters/ffmpeg/ffmpeg.js';
import type { AppConfig } from '../../server/src/config/index.js';
import type { SafePath } from '../../server/src/lib/vault.js';
import { ThumbnailService } from '../../server/src/modules/kiln/thumbnail.service.js';

let directory: string;
let video: SafePath;
beforeEach(async () => {
  directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'hearth-frames-'));
  video = path.join(directory, 'clip.mp4') as SafePath;
  await fsp.writeFile(video, 'not really a film');
});
afterEach(() => fsp.rm(directory, { recursive: true, force: true }));

/** An 8×8 JPEG, all one colour. */
const TINY_JPEG =
  '/9j/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIALNP/Z';

const isWebp = (bytes: Buffer) =>
  bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
  bytes.subarray(8, 12).toString('latin1') === 'WEBP';

/** An ffmpeg that records what it was asked and answers with a small JPEG, or nothing. */
function fakeFfmpeg(answer: 'frame' | 'empty' = 'frame') {
  const calls: { atSeconds: number; width: number; exact?: boolean }[] = [];
  const ffmpeg = {
    async extractFrame(
      _file: string,
      request: { atSeconds: number; width: number; exact?: boolean },
    ) {
      calls.push(request);
      if (answer === 'empty') return Buffer.alloc(0);
      return Buffer.from(TINY_JPEG, 'base64');
    },
  } as unknown as FfmpegAdapter;
  return { ffmpeg, calls };
}

function service(ffmpeg: FfmpegAdapter): ThumbnailService {
  const config = { media: { thumbnailCacheDirectory: path.join(directory, 'cache') } };
  return new ThumbnailService(config as AppConfig, ffmpeg);
}

describe('seek-bar frames', () => {
  it('takes the exact frame at the moment, as WebP, and decodes each moment once', async () => {
    const { ffmpeg, calls } = fakeFfmpeg();
    const thumbnails = service(ffmpeg);

    const first = await thumbnails.frameAt(video, { atSeconds: 12, width: 240 });
    const again = await thumbnails.frameAt(video, { atSeconds: 12, width: 240 });
    await thumbnails.frameAt(video, { atSeconds: 24, width: 240 });

    expect(isWebp(first!)).toBe(true);
    expect(again).toEqual(first);
    expect(calls).toEqual([
      { atSeconds: 12, width: 240, exact: true },
      { atSeconds: 24, width: 240, exact: true },
    ]);
  });

  it('has no frame past the end of the stream, and does not cache the miss', async () => {
    const { ffmpeg, calls } = fakeFfmpeg('empty');
    const thumbnails = service(ffmpeg);

    expect(await thumbnails.frameAt(video, { atSeconds: 9999, width: 240 })).toBeNull();
    expect(await thumbnails.frameAt(video, { atSeconds: 9999, width: 240 })).toBeNull();
    expect(calls).toHaveLength(2);
  });
});
