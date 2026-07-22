import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Readable } from 'node:stream';

import {
  BROWSER_AUDIO_CODECS,
  BROWSER_VIDEO_CODECS,
  type MediaProbe,
  type MediaTrack,
} from '@hearth/shared';

import { HearthError } from '../../lib/errors.js';

/**
 * ffmpeg and ffprobe are driven by spawning them directly rather than through a
 * wrapper library, because the one thing this adapter must get right is child
 * process lifetime: an abandoned transcode holds a CPU core and a file handle
 * until it is killed, and every path out of here kills its child.
 */
export interface FfmpegOptions {
  ffmpegPath: string;
  ffprobePath: string;
  crf: number;
  preset: string;
}

export interface TranscodeOptions {
  /** Index within the file's audio streams, not the global stream index. */
  audioTrack?: number | undefined;
  /** Seek offset in seconds, applied before decoding so it stays cheap. */
  startSeconds?: number | undefined;
}

interface ProbeStream {
  index: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  tags?: { language?: string; title?: string };
}

interface ProbePayload {
  format?: { duration?: string };
  streams?: ProbeStream[];
}

export class FfmpegAdapter {
  constructor(private readonly options: FfmpegOptions) {}

  async probe(filePath: string, signal?: AbortSignal): Promise<MediaProbe> {
    const output = await this.collect(
      this.options.ffprobePath,
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      signal,
    );

    let payload: ProbePayload;
    try {
      payload = JSON.parse(output) as ProbePayload;
    } catch {
      throw HearthError.badRequest('That file could not be read as media');
    }

    const streams = payload.streams ?? [];
    const video = streams.find(stream => stream.codec_type === 'video');
    const audio = streams.filter(stream => stream.codec_type === 'audio');
    const subtitles = streams.filter(stream => stream.codec_type === 'subtitle');

    const duration = Number.parseFloat(payload.format?.duration ?? '');

    return {
      durationSeconds: Number.isFinite(duration) ? duration : null,
      width: video?.width ?? null,
      height: video?.height ?? null,
      videoCodec: video?.codec_name ?? null,
      audioCodec: audio[0]?.codec_name ?? null,
      browserPlayable: isBrowserPlayable(video?.codec_name, audio[0]?.codec_name),
      audioTracks: audio.map(toTrack),
      subtitleTracks: subtitles.map(toTrack),
      // `toTrack` reports the ordinal within the kind, which is what the
      // `-map 0:a:N` and `-map 0:s:N` selectors below take.
    };
  }

  /**
   * Re-encode to fragmented MP4 on stdout. Fragmented output can start playing
   * before the encode finishes, which is what makes seeking into a long file
   * feel immediate.
   */
  transcode(filePath: string, options: TranscodeOptions, signal: AbortSignal): Readable {
    const args: string[] = [];

    // Placing -ss before -i seeks by keyframe index instead of decoding to the
    // offset, which is the difference between instant and minutes.
    if (options.startSeconds && options.startSeconds > 0) {
      args.push('-ss', options.startSeconds.toFixed(3));
    }

    args.push(
      '-i', filePath,
      '-map', '0:v:0?',
      '-map', `0:a:${options.audioTrack ?? 0}?`,
      '-c:v', 'libx264',
      '-preset', this.options.preset,
      '-crf', String(this.options.crf),
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-ac', '2',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4',
      'pipe:1',
    );

    const child = this.spawnBound(this.options.ffmpegPath, args, signal);
    return child.stdout;
  }

  /** Extract one subtitle track as WebVTT, which is the only format a browser takes. */
  async extractSubtitle(
    filePath: string,
    trackIndex: number,
    signal?: AbortSignal,
  ): Promise<string> {
    return this.collect(
      this.options.ffmpegPath,
      ['-v', 'quiet', '-i', filePath, '-map', `0:s:${trackIndex}`, '-f', 'webvtt', 'pipe:1'],
      signal,
    );
  }

  /** Grab a single frame as a JPEG, for a video thumbnail. */
  async extractFrame(
    filePath: string,
    atSeconds: number,
    width: number,
    signal?: AbortSignal,
  ): Promise<Buffer> {
    return this.collectBinary(
      this.options.ffmpegPath,
      [
        '-v', 'quiet',
        '-ss', atSeconds.toFixed(2),
        '-i', filePath,
        '-frames:v', '1',
        '-vf', `scale=${width}:-2`,
        '-f', 'image2',
        '-c:v', 'mjpeg',
        'pipe:1',
      ],
      signal,
    );
  }

  /** Spawn a child whose life is tied to `signal`; aborting kills it immediately. */
  private spawnBound(
    command: string,
    args: string[],
    signal: AbortSignal | undefined,
  ): ChildProcessWithoutNullStreams {
    const child = spawn(command, args, { windowsHide: true });

    const kill = (): void => {
      if (!child.killed) child.kill('SIGKILL');
    };

    if (signal) {
      if (signal.aborted) kill();
      else signal.addEventListener('abort', kill, { once: true });
      child.once('close', () => signal.removeEventListener('abort', kill));
    }

    // If the consumer stops reading (a closed socket), the child must go too.
    child.stdout.once('close', kill);
    child.once('error', kill);

    return child;
  }

  private async collectBinary(
    command: string,
    args: string[],
    signal?: AbortSignal,
  ): Promise<Buffer> {
    const child = this.spawnBound(command, args, signal);
    const chunks: Buffer[] = [];
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      // Bounded: a failing ffmpeg can produce a lot of diagnostics.
      if (stderr.length < 4096) stderr += chunk.toString();
    });

    return new Promise<Buffer>((resolve, reject) => {
      child.once('error', () =>
        reject(HearthError.internal('ffmpeg is not available — check that it is on PATH')),
      );
      child.once('close', code => {
        if (code === 0) resolve(Buffer.concat(chunks));
        else if (signal?.aborted) reject(new HearthError('ABORTED', 'The request was cancelled'));
        else reject(HearthError.badRequest(`Media processing failed: ${stderr.trim().slice(0, 200)}`));
      });
    });
  }

  private async collect(command: string, args: string[], signal?: AbortSignal): Promise<string> {
    return (await this.collectBinary(command, args, signal)).toString('utf8');
  }
}

/**
 * `index` is the ordinal within the track's own kind — the first audio track is
 * 0 regardless of its global stream index — because that is what ffmpeg's
 * `-map 0:a:N` selector and the client's track picker both use.
 */
function toTrack(stream: ProbeStream, ordinal: number): MediaTrack {
  return {
    index: ordinal,
    codec: stream.codec_name ?? 'unknown',
    language: stream.tags?.language ?? null,
    title: stream.tags?.title ?? null,
  };
}

function isBrowserPlayable(videoCodec: string | undefined, audioCodec: string | undefined): boolean {
  const videoOk = !videoCodec || BROWSER_VIDEO_CODECS.has(videoCodec);
  const audioOk = !audioCodec || BROWSER_AUDIO_CODECS.has(audioCodec);
  return videoOk && audioOk;
}
