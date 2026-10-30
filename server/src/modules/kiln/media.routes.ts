import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { CueSheet, MediaProbe } from '@hearth/shared';

import type { FfmpegAdapter } from '../../adapters/ffmpeg/ffmpeg.js';
import { isAbortError } from '../../lib/errors.js';
import { maximum } from '../../lib/limits.js';
import { abortSignalOf } from '../../lib/request.js';
import type { SafePath } from '../../lib/vault.js';
import type { ListingService } from '../vault/listing.service.js';
import type { CueService } from './cue.service.js';
import type { FolderCoverService } from './folder-cover.service.js';
import type { ArchiveMemberService } from './archive-member.service.js';
import {
  openFile,
  pathQuery,
  sendConversion,
  STREAM_FILE,
  type FileSources,
} from './route-helpers.js';
import type { StreamService } from './stream.service.js';
import type { SubtitleService } from './subtitle.service.js';
import type { ThumbnailService } from './thumbnail.service.js';

export interface MediaRouteServices {
  listing: ListingService;
  members: ArchiveMemberService;
  streams: StreamService;
  ffmpeg: FfmpegAdapter;
  subtitles: SubtitleService;
  thumbnails: ThumbnailService;
  folderCovers: FolderCoverService;
  cues: CueService;
}

/** Bytes for <video>, <audio> and <img>: raw files, conversions, subtitles, thumbnails; an album's tracks. */
export function createMediaRoutes(services: MediaRouteServices): FastifyPluginAsync {
  return async app => {
    await app.register(playbackRoutes(services));
    await app.register(thumbnailRoutes(services));
    await app.register(albumRoutes(services));
  };
}

/**
 * The tracks of an album ripped to one file (204 when it is just a file), and
 * audio the browser cannot decode as audio it can.
 */
function albumRoutes({ listing, members, cues, ffmpeg }: MediaRouteServices): FastifyPluginAsync {
  return async app => {
    /** Like a video conversion, not seekable: the client seeks by asking again with a new `start`. */
    app.get<{ Querystring: { path: string; token?: string; start?: number } }>(
      '/media/audio',
      {
        schema: { querystring: pathQuery({ start: { type: 'number', minimum: 0 } }) },
        config: STREAM_FILE,
      },
      async (request, reply) => {
        const { target } = await openFile({ listing, members }, request, request.query.path);
        const signal = abortSignalOf(request);
        const probe = await ffmpeg.probe(target, signal);
        const { stream, contentType } = ffmpeg.transcodeAudio(
          target,
          { startSeconds: request.query.start ?? 0, codec: probe.audioCodec },
          signal,
        );
        return sendConversion(reply, stream, contentType);
      },
    );

    app.get<{ Querystring: { path: string; token?: string } }>(
      '/media/cue',
      { schema: { querystring: pathQuery() }, config: STREAM_FILE },
      async (request, reply) => {
        const { target } = await openFile({ listing, members }, request, request.query.path);
        const sheet: CueSheet | null = await cues.sheetFor(target, abortSignalOf(request));
        // Not cached by the browser: a sheet dropped in beside the file should show up.
        reply.header('Cache-Control', 'no-cache');
        return sheet ? sheet : reply.code(204).send();
      },
    );
  };
}

/** A file as it is, its probe, a conversion the browser can play, and its subtitles as WebVTT. */
function playbackRoutes({
  listing,
  members,
  streams,
  ffmpeg,
  subtitles,
}: MediaRouteServices): FastifyPluginAsync {
  return async app => {
    app.route<{ Querystring: { path: string; token?: string } }>({
      method: ['GET', 'HEAD'],
      url: '/media/raw',
      schema: { querystring: pathQuery() },
      config: STREAM_FILE,
      handler: async (request, reply) => {
        return streams.send(
          request,
          reply,
          await openFile({ listing, members }, request, request.query.path),
        );
      },
    });

    app.get<{ Querystring: { path: string; token?: string } }>(
      '/media/probe',
      { schema: { querystring: pathQuery() }, config: STREAM_FILE },
      async request => {
        const { target } = await openFile({ listing, members }, request, request.query.path);
        const body: MediaProbe = await ffmpeg.probe(target, abortSignalOf(request));
        return body;
      },
    );

    /** Fragmented MP4 sent as produced; the ffmpeg child dies with the request. */
    app.get<{
      Querystring: { path: string; token?: string; audioTrack?: number; start?: number };
    }>(
      '/media/transcode',
      {
        schema: {
          querystring: pathQuery({
            audioTrack: { type: 'integer', minimum: 0, maximum: 64 },
            start: { type: 'number', minimum: 0 },
          }),
        },
        config: STREAM_FILE,
      },
      async (request, reply) => {
        const { target } = await openFile({ listing, members }, request, request.query.path);
        const stream = ffmpeg.transcode(
          target,
          { audioTrack: request.query.audioTrack, startSeconds: request.query.start },
          abortSignalOf(request),
        );
        return sendConversion(reply, stream, 'video/mp4');
      },
    );

    app.get<{ Querystring: { path: string; token?: string; track?: number } }>(
      '/media/subtitle',
      {
        schema: { querystring: pathQuery({ track: { type: 'integer', minimum: 0, maximum: 64 } }) },
        config: STREAM_FILE,
      },
      async (request, reply) => {
        const { target } = await openFile({ listing, members }, request, request.query.path);
        const vtt = await subtitles.vtt(target, request.query.track ?? 0, abortSignalOf(request));
        return reply
          .header('Content-Type', 'text/vtt; charset=utf-8')
          .header('Cache-Control', 'private, max-age=3600')
          .send(vtt);
      },
    );
  };
}

function thumbnailRoutes({
  listing,
  members,
  thumbnails,
  folderCovers,
}: MediaRouteServices): FastifyPluginAsync {
  return async app => {
    app.get<{
      Querystring: { path: string; token?: string; width?: number; quality?: number; v?: string };
    }>(
      '/thumbnail',
      {
        schema: {
          querystring: pathQuery({
            width: {
              type: 'integer',
              minimum: 16,
              ...maximum(app.hearth.config.media.thumbnailMaxWidth),
              default: 320,
            },
            quality: { type: 'integer', minimum: 1, maximum: 100, default: 72 },
            // The client's version of the file (mtime and size); only a cache key.
            v: { type: 'string', maxLength: 64 },
          }),
        },
        config: STREAM_FILE,
      },
      async (request, reply) => {
        const source = await thumbnailSource(request, { listing, members }, folderCovers);

        // "Nothing to show" is an answer, not an error; the client keeps its icon.
        if (!source) return reply.code(204).send();

        // A versioned URL (from a listing) can be kept; a bare one must revalidate,
        // or a file replaced in place, or the same path in another root, would
        // keep showing the old picture.
        const size = { width: request.query.width ?? 320, quality: request.query.quality ?? 72 };
        const etag = await thumbnails.etag(source, size);
        reply
          .header('ETag', etag)
          .header(
            'Cache-Control',
            request.query.v ? 'private, max-age=86400, immutable' : 'private, no-cache',
          );
        if (request.headers['if-none-match'] === etag) return reply.code(304).send();

        const thumbnail = await thumbnails.render(source, size, abortSignalOf(request));
        // Not cached: "no picture" can stop being true without the file changing,
        // for one when the server learns to read a new format.
        if (!thumbnail) {
          reply.removeHeader('ETag');
          return reply.code(204).header('Cache-Control', 'no-store').send();
        }
        return reply.header('Content-Type', 'image/webp').send(thumbnail);
      },
    );

    /** A video's frame at a moment, for the preview above its seek bar. */
    app.get<{
      Querystring: { path: string; token?: string; at: number; width?: number; v?: string };
    }>(
      '/media/frame',
      {
        schema: {
          querystring: pathQuery(
            {
              at: { type: 'number', minimum: 0 },
              width: {
                type: 'integer',
                minimum: 16,
                ...maximum(app.hearth.config.media.thumbnailMaxWidth),
                default: 192,
              },
              // The client's version of the file (mtime and size); only a cache key.
              v: { type: 'string', maxLength: 64 },
            },
            ['path', 'at'],
          ),
        },
        config: STREAM_FILE,
      },
      async (request, reply) => {
        const { target } = await openFile({ listing, members }, request, request.query.path);
        const frame = await thumbnails
          .frameAt(
            target,
            { atSeconds: request.query.at, width: request.query.width ?? 192 },
            abortSignalOf(request),
          )
          // A moment ffmpeg cannot reach (past the end, a damaged file) has no preview.
          .catch(error => {
            if (isAbortError(error)) throw error;
            return null;
          });
        if (!frame) return reply.code(204).header('Cache-Control', 'no-store').send();
        return reply
          .header('Content-Type', 'image/webp')
          .header(
            'Cache-Control',
            request.query.v ? 'private, max-age=86400, immutable' : 'private, no-cache',
          )
          .send(frame);
      },
    );
  };
}

/**
 * What a thumbnail is drawn from: the file, a file inside an archive, or for a
 * folder the picture chosen as its cover (null when there is none).
 */
async function thumbnailSource(
  request: FastifyRequest<{ Querystring: { path: string } }>,
  files: FileSources,
  folderCovers: FolderCoverService,
): Promise<SafePath | null> {
  const target = request.resolvePath(request.query.path, 'read');
  const entry = await files.listing.require(target);
  if (entry.isDirectory) return folderCovers.sourceFor(target, abortSignalOf(request));
  const { member } = request.query as { member?: string };
  if (!member) return target;
  const picture = await files.members.openPicture(
    target,
    await files.listing.assertFile(target),
    member,
  );
  return picture.target;
}
