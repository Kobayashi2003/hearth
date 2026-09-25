import type { FastifyPluginAsync } from 'fastify';
import type {
  ArchiveListing,
  ComicManifest,
  MediaProbe,
  OfficeContentResponse,
  TextContentResponse,
  TextWriteRequest,
} from '@hearth/shared';

import type { FfmpegAdapter } from '../../adapters/ffmpeg/ffmpeg.js';
import { decodeText } from '../../lib/charset.js';
import { inlineSafetyHeaders, mimeForPath } from '../../lib/mime.js';
import { bodyLimit, maximum } from '../../lib/limits.js';
import { abortSignalOf } from '../../lib/request.js';
import { buildRateLimits } from '../../plugins/rate-limit.js';
import type { ListingService } from '../vault/listing.service.js';
import type { ArchiveService } from './archive.service.js';
import type { BackgroundService } from './background.service.js';
import type { ComicService } from './comic.service.js';
import { contentDisposition } from './stream.service.js';
import type { DocumentService } from './document.service.js';
import type { StreamService } from './stream.service.js';
import type { TextService } from './text.service.js';
import type { ThumbnailService } from './thumbnail.service.js';
import type { FolderCoverService } from './folder-cover.service.js';

export interface KilnServices {
  listing: ListingService;
  streams: StreamService;
  text: TextService;
  thumbnails: ThumbnailService;
  folderCovers: FolderCoverService;
  comics: ComicService;
  archives: ArchiveService;
  documents: DocumentService;
  backgrounds: BackgroundService;
  ffmpeg: FfmpegAdapter;
}

const pathQuerySchema = {
  type: 'object',
  required: ['path'],
  properties: {
    path: { type: 'string', maxLength: 4096 },
    token: { type: 'string', maxLength: 1024 },
  },
} as const;

export function createKilnRoutes(services: KilnServices): FastifyPluginAsync {
  const {
    listing,
    streams,
    text,
    thumbnails,
    folderCovers,
    comics,
    archives,
    documents,
    backgrounds,
    ffmpeg,
  } = services;

  return async app => {
    const rateLimits = buildRateLimits(app.hearth.config);
    const readConfig = { permission: 'read' as const };
    const streamConfig = { auth: 'media-token' as const, permission: 'read' as const };

    app.route<{ Querystring: { path: string; token?: string } }>({
      method: ['GET', 'HEAD'],
      url: '/media/raw',
      schema: { querystring: pathQuerySchema },
      config: streamConfig,
      handler: async (request, reply) => {
        const target = request.resolvePath(request.query.path, 'read');
        const entry = await listing.assertFile(target);
        return streams.send(request, reply, target, entry);
      },
    });

    app.get<{ Querystring: { path: string; token?: string } }>(
      '/media/probe',
      { schema: { querystring: pathQuerySchema }, config: streamConfig },
      async request => {
        const target = request.resolvePath(request.query.path, 'read');
        await listing.assertFile(target);
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
          querystring: {
            ...pathQuerySchema,
            properties: {
              ...pathQuerySchema.properties,
              audioTrack: { type: 'integer', minimum: 0, maximum: 64 },
              start: { type: 'number', minimum: 0 },
            },
          },
        },
        config: streamConfig,
      },
      async (request, reply) => {
        const target = request.resolvePath(request.query.path, 'read');
        await listing.assertFile(target);

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
        schema: {
          querystring: {
            ...pathQuerySchema,
            properties: {
              ...pathQuerySchema.properties,
              track: { type: 'integer', minimum: 0, maximum: 64 },
            },
          },
        },
        config: streamConfig,
      },
      async (request, reply) => {
        const target = request.resolvePath(request.query.path, 'read');
        await listing.assertFile(target);
        const vtt = await ffmpeg.extractSubtitle(
          target,
          request.query.track ?? 0,
          abortSignalOf(request),
        );
        return reply.header('Content-Type', 'text/vtt; charset=utf-8').send(vtt);
      },
    );

    app.get<{ Querystring: { path: string; token?: string; width?: number; quality?: number } }>(
      '/thumbnail',
      {
        schema: {
          querystring: {
            ...pathQuerySchema,
            properties: {
              ...pathQuerySchema.properties,
              width: {
                type: 'integer',
                minimum: 16,
                ...maximum(app.hearth.config.media.thumbnailMaxWidth),
                default: 320,
              },
              quality: { type: 'integer', minimum: 1, maximum: 100, default: 72 },
            },
          },
        },
        config: streamConfig,
      },
      async (request, reply) => {
        const target = request.resolvePath(request.query.path, 'read');
        const entry = await listing.require(target);

        const source = entry.isDirectory
          ? await folderCovers.sourceFor(target, abortSignalOf(request))
          : target;

        // "Nothing to show" is an answer, not an error; the client keeps its icon.
        if (!source) return reply.code(204).send();

        const thumbnail = await thumbnails.render(
          source,
          { width: request.query.width ?? 320, quality: request.query.quality ?? 72 },
          abortSignalOf(request),
        );

        if (!thumbnail) return reply.code(204).send();

        return reply
          .header('Content-Type', 'image/webp')
          .header('Cache-Control', 'private, max-age=86400, immutable')
          .send(thumbnail);
      },
    );

    app.get<{ Querystring: { path: string; encoding?: string } }>(
      '/content',
      {
        schema: {
          querystring: {
            ...pathQuerySchema,
            properties: {
              ...pathQuerySchema.properties,
              encoding: { type: 'string', maxLength: 32 },
            },
          },
        },
        config: readConfig,
      },
      async request => {
        const target = request.resolvePath(request.query.path, 'read');
        await listing.assertFile(target);
        const body: TextContentResponse = await text.read(target, request.query.encoding);
        return body;
      },
    );

    app.put<{ Body: TextWriteRequest }>(
      '/content',
      {
        schema: {
          body: {
            type: 'object',
            required: ['path', 'content'],
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
              encoding: { type: 'string', maxLength: 32 },
            },
          },
        },
        config: { permission: 'write', rateLimit: rateLimits.write },
        bodyLimit: bodyLimit(app.hearth.config.media.maxTextSaveBytes),
      },
      async request => {
        const target = request.resolvePath(request.body.path, 'write');
        await text.write(target, request.body.content, request.body.encoding);
        return { ok: true };
      },
    );

    app.get<{ Querystring: { path: string } }>(
      '/comic',
      { schema: { querystring: pathQuerySchema }, config: readConfig },
      async request => {
        const target = request.resolvePath(request.query.path, 'read');
        await listing.assertFile(target);
        const body: ComicManifest = await comics.open(target, abortSignalOf(request));
        return body;
      },
    );

    /** The page name is checked against the cached manifest, never joined blindly. */
    app.get<{ Params: { key: string; page: string } }>(
      '/comic/:key/:page',
      { config: streamConfig },
      async (request, reply) =>
        streams.sendGenerated(
          reply,
          await comics.pagePath(request.params.key, request.params.page),
        ),
    );

    app.get<{ Querystring: { path: string } }>(
      '/archive',
      { schema: { querystring: pathQuerySchema }, config: readConfig },
      async request => {
        const target = request.resolvePath(request.query.path, 'read');
        await listing.assertFile(target);
        const body: ArchiveListing = await archives.list(target, abortSignalOf(request));
        return body;
      },
    );

    /** One member, extracted on demand; the name is matched against the archive listing. */
    app.get<{ Querystring: { path: string; entry: string; token?: string } }>(
      '/archive/entry',
      {
        schema: {
          querystring: {
            ...pathQuerySchema,
            required: ['path', 'entry'],
            properties: {
              ...pathQuerySchema.properties,
              entry: { type: 'string', maxLength: 4096 },
            },
          },
        },
        config: streamConfig,
      },
      async (request, reply) => {
        const target = request.resolvePath(request.query.path, 'read');
        await listing.assertFile(target);

        const member = await archives.read(target, request.query.entry, abortSignalOf(request));
        const mimeType = mimeForPath(member.name);
        // Text inside an archive keeps its original encoding; the browser would guess. Send UTF-8.
        const isText = /^text\/|\/(json|xml|javascript)$/.test(mimeType);
        const body = isText ? Buffer.from(decodeText(member.content), 'utf8') : member.content;
        return reply
          .header('Content-Type', isText ? `${mimeType}; charset=utf-8` : mimeType)
          .headers(inlineSafetyHeaders(mimeType))
          .header('Content-Disposition', contentDisposition(member.name, 'inline'))
          .header('Cache-Control', 'private, max-age=3600')
          .send(body);
      },
    );

    app.get<{ Querystring: { path: string } }>(
      '/office',
      { schema: { querystring: pathQuerySchema }, config: readConfig },
      async request => {
        const target = request.resolvePath(request.query.path, 'read');
        await listing.assertFile(target);
        const body: OfficeContentResponse = await documents.renderOffice(
          target,
          abortSignalOf(request),
        );
        return body;
      },
    );

    app.get<{ Querystring: { path: string } }>(
      '/html-proxy',
      { schema: { querystring: pathQuerySchema }, config: readConfig },
      async request => {
        const target = request.resolvePath(request.query.path, 'read');
        await listing.assertFile(target);
        return documents.renderHtml(target);
      },
    );

    app.get('/backgrounds', { config: readConfig }, async () => ({
      backgrounds: await backgrounds.list(),
    }));

    app.get<{ Querystring: { name?: string; token?: string } }>(
      '/background',
      { config: streamConfig },
      async (request, reply) => {
        const name = request.query.name ?? (await backgrounds.pickRandom());
        return streams.sendGenerated(reply, await backgrounds.resolve(name), name);
      },
    );
  };
}
