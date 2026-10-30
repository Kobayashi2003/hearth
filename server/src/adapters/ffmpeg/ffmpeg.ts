import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import os from 'node:os';
import type { Readable } from 'node:stream';

import {
  BROWSER_AUDIO_CODECS,
  BROWSER_VIDEO_CODECS,
  type MediaProbe,
  type MediaTrack,
} from '@hearth/shared';

import { HearthError } from '../../lib/errors.js';

/**
 * ffmpeg/ffprobe spawned directly: the thing that must be right is child
 * lifetime, and every path out of here kills its child.
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
  format?: { duration?: string; format_name?: string };
  streams?: ProbeStream[];
}

export interface TagsAndChapters {
  tags: Record<string, string>;
  chapters: Array<{ start: number; title: string | null }>;
}

/** Longest one poster or seek frame may take before it is given up. */
const FRAME_TIMEOUT_MS = 30_000;

function isSignal(signal: AbortSignal | undefined): signal is AbortSignal {
  return signal !== undefined;
}

export class FfmpegAdapter {
  constructor(private readonly options: FfmpegOptions) {}

  async probe(filePath: string, signal?: AbortSignal): Promise<MediaProbe> {
    const output = await this.collect(
      this.options.ffprobePath,
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      signal,
    );

    return summarise(parseProbe(output));
  }

  /**
   * The container's own tags (a FLAC's Vorbis comments, an audiobook's title
   * and author) as ffprobe names them, and its chapters in order.
   */
  async tagsAndChapters(filePath: string, signal?: AbortSignal): Promise<TagsAndChapters> {
    const output = await this.collect(
      this.options.ffprobePath,
      [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_entries',
        'format_tags',
        '-show_chapters',
        filePath,
      ],
      signal,
    );
    const payload = JSON.parse(output) as {
      format?: { tags?: Record<string, string> };
      chapters?: Array<{ start_time?: string; tags?: { title?: string } }>;
    };
    return {
      tags: payload.format?.tags ?? {},
      chapters: (payload.chapters ?? []).map(chapter => ({
        start: Number.parseFloat(chapter.start_time ?? '0') || 0,
        title: chapter.tags?.title?.trim() || null,
      })),
    };
  }

  /** Fragmented MP4 on stdout, playable before the encode finishes. */
  transcode(filePath: string, options: TranscodeOptions, signal: AbortSignal): Readable {
    const args: string[] = [];

    // -ss before -i seeks by keyframe instead of decoding up to the offset.
    if (options.startSeconds && options.startSeconds > 0) {
      args.push('-ss', options.startSeconds.toFixed(3));
    }

    args.push(
      '-i',
      filePath,
      '-map',
      '0:v:0?',
      '-map',
      `0:a:${options.audioTrack ?? 0}?`,
      '-c:v',
      'libx264',
      '-preset',
      this.options.preset,
      '-crf',
      String(this.options.crf),
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-ac',
      '2',
      '-movflags',
      'frag_keyframe+empty_moov+default_base_moof',
      '-f',
      'mp4',
      'pipe:1',
    );

    const child = this.spawnBound(this.options.ffmpegPath, args, signal);
    return child.stdout;
  }

  /**
   * Audio the browser cannot decode, as audio it can, on stdout from `startSeconds`.
   * A lossless source stays lossless (FLAC); a lossy one becomes AAC rather
   * than a lossless copy several times its size. Cover art is left out.
   */
  transcodeAudio(
    filePath: string,
    { startSeconds, codec }: { startSeconds: number; codec: string | null },
    signal: AbortSignal,
  ): { stream: Readable; contentType: string } {
    const lossless = codec !== null && isLossless(codec);
    const args = startSeconds > 0 ? ['-ss', startSeconds.toFixed(3)] : [];
    args.push('-v', 'error', '-i', filePath, '-map', '0:a:0', '-vn');
    if (lossless) {
      // DSD runs at megahertz rates no browser takes; 88.2 kHz keeps it exact in 24 bits.
      if (codec.startsWith('dsd')) args.push('-ar', '88200', '-sample_fmt', 's32');
      args.push('-c:a', 'flac', '-f', 'flac', 'pipe:1');
    } else {
      args.push(
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        'frag_keyframe+empty_moov+default_base_moof',
        '-f',
        'mp4',
        'pipe:1',
      );
    }
    const child = this.spawnBound(this.options.ffmpegPath, args, signal);
    return { stream: child.stdout, contentType: lossless ? 'audio/flac' : 'audio/mp4' };
  }

  /** Several subtitle tracks in one pass: extracting any one reads the whole file. */
  async extractSubtitles(
    filePath: string,
    outputs: ReadonlyArray<{ track: number; file: string }>,
    signal?: AbortSignal,
  ): Promise<void> {
    const args = ['-v', 'quiet', '-y', '-i', filePath];
    for (const output of outputs) {
      args.push('-map', `0:s:${output.track}`, '-f', 'webvtt', output.file);
    }
    await this.collect(this.options.ffmpegPath, args, signal);
  }

  /**
   * One frame as JPEG. By default the most representative of the next 60
   * frames, so a poster is not a fade or a black cut; `exact` takes the frame
   * at that moment, as a seek preview must. The candidates are scaled down
   * before they are compared: `thumbnail` holds all of them at once, and 60
   * frames of an 8K source would take gigabytes. A frame that takes longer than
   * `FRAME_TIMEOUT_MS` (a damaged file, a stream with nothing to seek by) is
   * given up on.
   */
  async extractFrame(
    filePath: string,
    { atSeconds, width, exact = false }: { atSeconds: number; width: number; exact?: boolean },
    signal?: AbortSignal,
  ): Promise<Buffer> {
    return this.collectBinary(
      this.options.ffmpegPath,
      [
        '-v',
        'quiet',
        // One thread each: a folder of videos runs several of these at once,
        // and by default each would take every core.
        '-threads',
        '1',
        '-filter_threads',
        '1',
        '-ss',
        atSeconds.toFixed(2),
        '-i',
        filePath,
        '-frames:v',
        '1',
        '-vf',
        exact ? `scale=${width}:-2` : `scale=${width}:-2,thumbnail=60`,
        '-f',
        'image2',
        '-c:v',
        'mjpeg',
        'pipe:1',
      ],
      AbortSignal.any([signal, AbortSignal.timeout(FRAME_TIMEOUT_MS)].filter(isSignal)),
      { background: true },
    );
  }

  private spawnBound(
    command: string,
    args: string[],
    signal: AbortSignal | undefined,
    { background = false }: { background?: boolean } = {},
  ): ChildProcessWithoutNullStreams {
    const child = spawn(command, args, { windowsHide: true });
    // Work nobody is watching (a tile's poster frame) yields to the browser
    // decoding a video on the same machine, and to a transcode someone is.
    if (background && child.pid !== undefined) {
      try {
        os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
      } catch {
        // Not permitted here: it simply runs at normal priority.
      }
    }

    const kill = (): void => {
      if (!child.killed) child.kill('SIGKILL');
    };

    if (signal) {
      if (signal.aborted) kill();
      else signal.addEventListener('abort', kill, { once: true });
      child.once('close', () => signal.removeEventListener('abort', kill));
    }

    child.stdout.once('close', kill);
    child.once('error', kill);
    // Read whether or not anyone wants it: a full stderr pipe blocks ffmpeg, and a
    // stream would stop mid-file. Whoever wants it adds a listener of their own.
    child.stderr.resume();

    return child;
  }

  private async collectBinary(
    command: string,
    args: string[],
    signal?: AbortSignal,
    options: { background?: boolean } = {},
  ): Promise<Buffer> {
    const child = this.spawnBound(command, args, signal, options);
    const chunks: Buffer[] = [];
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 4096) stderr += chunk.toString();
    });

    return new Promise<Buffer>((resolve, reject) => {
      child.once('error', () =>
        reject(HearthError.internal('ffmpeg is not available — check that it is on PATH')),
      );
      child.once('close', code => {
        if (code === 0) resolve(Buffer.concat(chunks));
        else if (signal?.aborted) reject(new HearthError('ABORTED', 'The request was cancelled'));
        else
          reject(HearthError.badRequest(`Media processing failed: ${stderr.trim().slice(0, 200)}`));
      });
    });
  }

  private async collect(command: string, args: string[], signal?: AbortSignal): Promise<string> {
    return (await this.collectBinary(command, args, signal)).toString('utf8');
  }
}

function parseProbe(output: string): ProbePayload {
  try {
    return JSON.parse(output) as ProbePayload;
  } catch {
    throw HearthError.badRequest('That file could not be read as media');
  }
}

/** What the viewer needs from ffprobe: length, picture, codecs, tracks, and whether to convert. */
function summarise(payload: ProbePayload): MediaProbe {
  const streams = payload.streams ?? [];
  const video = streams.find(stream => stream.codec_type === 'video');
  const audio = streams.filter(stream => stream.codec_type === 'audio');
  const subtitles = streams.filter(stream => stream.codec_type === 'subtitle');
  const duration = Number.parseFloat(payload.format?.duration ?? '');
  const audioCodec = audio[0]?.codec_name;

  return {
    durationSeconds: Number.isFinite(duration) ? duration : null,
    ...picture(video),
    audioCodec: audioCodec ?? null,
    browserPlayable: isBrowserPlayable(payload.format?.format_name, video?.codec_name, audioCodec),
    audioTracks: audio.map(toTrack),
    subtitleTracks: subtitles.map(toTrack),
  };
}

function picture(video: ProbeStream | undefined) {
  return {
    width: video?.width ?? null,
    height: video?.height ?? null,
    videoCodec: video?.codec_name ?? null,
  };
}
/** `index` is the ordinal within its kind, matching ffmpeg's `-map 0:a:N`. */
function toTrack(stream: ProbeStream, ordinal: number): MediaTrack {
  return {
    index: ordinal,
    codec: stream.codec_name ?? 'unknown',
    language: stream.tags?.language ?? null,
    title: stream.tags?.title ?? null,
  };
}

/**
 * ffprobe's format names for the containers a browser opens. Matroska is
 * included because Chromium plays most .mkv files; where it cannot, the client
 * falls back to transcoding. AVI, MPEG-TS, FLV and ASF never play natively,
 * whatever codec they carry.
 */
// The audio-only ones are files a browser plays from an <audio> element as they are.
const BROWSER_CONTAINERS = ['mp4', 'mov', 'webm', 'matroska', 'ogg', 'mp3', 'flac', 'wav', 'aac'];

/** Codecs that lose nothing; converting them to a lossy one would. */
const LOSSLESS_PREFIXES = [
  'ape',
  'tta',
  'wavpack',
  'tak',
  'alac',
  'flac',
  'pcm_',
  'dsd_',
  'mlp',
  'truehd',
  'shorten',
];

function isLossless(codec: string): boolean {
  return LOSSLESS_PREFIXES.some(prefix => codec.startsWith(prefix));
}

function isBrowserPlayable(
  formatName: string | undefined,
  videoCodec: string | undefined,
  audioCodec: string | undefined,
): boolean {
  const containers = (formatName ?? '').split(',');
  if (!containers.some(name => BROWSER_CONTAINERS.includes(name))) return false;
  const videoOk = !videoCodec || BROWSER_VIDEO_CODECS.has(videoCodec);
  // Plain PCM only plays as a WAV file; inside a video container it is a conversion.
  const pcmInWav = containers.includes('wav') && Boolean(audioCodec?.startsWith('pcm_'));
  const audioOk = !audioCodec || BROWSER_AUDIO_CODECS.has(audioCodec) || pcmInWav;
  return videoOk && audioOk;
}
