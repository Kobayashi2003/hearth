import type { FastifyPluginAsync } from 'fastify';
import type { MediaProbe } from '@hearth/shared';

import type { FfmpegAdapter } from '../../adapters/ffmpeg/ffmpeg.js';
import { maximum } from '../../lib/limits.js';
import { abortSignalOf } from '../../lib/request.js';
import type { ListingService } from '../vault/listing.service.js';
import type { FolderCoverService } from './folder-cover.service.js';
import { openFile, pathQuery, STREAM } from './route-helpers.js';
import type { StreamService } from './stream.service.js';
import type { SubtitleService } from './subtitle.service.js';
import type { ThumbnailService } from './thumbnail.service.js';

export interface MediaRouteServices {
  listing: ListingService;
  streams: StreamService;
  ffmpeg: FfmpegAdapter;
  subtitles: SubtitleService;
  thumbnails: ThumbnailService;
  folderCovers: FolderCoverService;
}

/** Bytes for <video>, <audio> and <img>: raw files, conversions, subtitles, thumbnails. */
export function createMediaRoutes(services: MediaRouteServices): FastifyPluginAsync {
  const { listing, streams, ffmpeg, subtitles, thumbnails, folderCovers } = services;

  return async app => {
    app.route<{ Querystring: { path: string; token?: string } }>({
      method: ['GET', 'HEAD'],
      url: '/media/raw',
      schema: { querystring: pathQuery() },
      config: STREAM,
      handler: async (request, reply) => {
        const { target, entry } = await openFile(listing, request, request.query.path);
        return streams.send(request, reply, target, entry);
      },
    });

    app.get<{ Querystring: { path: string; token?: string } }>(
      '/media/probe',
      { schema: { querystring: pathQuery() }, config: STREAM },
      async request => {
        const { target } = await openFile(listing, request, request.query.path);
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
        config: STREAM,
      },
      async (request, reply) => {
        const { target } = await openFile(listing, request, request.query.path);
        const stream = ffmpeg.transcode(
          target,
          { audioTrack: request.query.audioTrack, startSeconds: request.query.start },
          abortSignalOf(request),
        );
        // Not byte-seekable: the client seeks by restarting with a new `start`.
        return reply
          .header('Content-Type', 'video/mp4')
          .header('Cache-Control', 'no-store')
          .header('Accept-Ranges', 'none')
          .send(stream);
      },
    );

    app.get<{ Querystring: { path: string; token?: string; track?: number } }>(
      '/media/subtitle',
      {
        schema: { querystring: pathQuery({ track: { type: 'integer', minimum: 0, maximum: 64 } }) },
        config: STREAM,
      },
      async (request, reply) => {
        const { target } = await openFile(listing, request, request.query.path);
        const vtt = await subtitles.vtt(target, request.query.track ?? 0, abortSignalOf(request));
        return reply
          .header('Content-Type', 'text/vtt; charset=utf-8')
          .header('Cache-Control', 'private, max-age=3600')
          .send(vtt);
      },
    );

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
        config: STREAM,
      },
      async (request, reply) => {
        const target = request.resolvePath(request.query.path, 'read');
        const entry = await listing.require(target);
        const source = entry.isDirectory
          ? await folderCovers.sourceFor(target, abortSignalOf(request))
          : target;

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
        if (!thumbnail) return reply.code(204).send();
        return reply.header('Content-Type', 'image/webp').send(thumbnail);
      },
    );
  };
}
