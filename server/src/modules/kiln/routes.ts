import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type {
  ComicManifest,
  MediaProbe,
  OfficeContentResponse,
  TextContentResponse,
  TextWriteRequest,
} from '@hearth/shared';

import type { FfmpegAdapter } from '../../adapters/ffmpeg/ffmpeg.js';
import { buildRateLimits } from '../../plugins/rate-limit.js';
import type { ListingService } from '../vault/listing.service.js';
import type { BackgroundService } from './background.service.js';
import type { ComicService } from './comic.service.js';
import type { DocumentService } from './document.service.js';
import type { StreamService } from './stream.service.js';
import type { TextService } from './text.service.js';
import type { ThumbnailService } from './thumbnail.service.js';

export interface KilnServices {
  listing: ListingService;
  streams: StreamService;
  text: TextService;
  thumbnails: ThumbnailService;
  comics: ComicService;
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

/** Client disconnect must stop transcodes and worker jobs, not just the response. */
function abortSignalOf(request: FastifyRequest): AbortSignal {
  const controller = new AbortController();
  request.raw.on('close', () => {
    if (!request.raw.readableEnded) controller.abort();
  });
  return controller.signal;
}

export function createKilnRoutes(services: KilnServices): FastifyPluginAsync {
  const { listing, streams, text, thumbnails, comics, documents, backgrounds, ffmpeg } = services;

  return async app => {
    const rateLimits = buildRateLimits(app.hearth.config);
    const readConfig = { permission: 'read' as const };
    const streamConfig = { auth: 'media-token' as const, permission: 'read' as const };

    // ── Raw bytes ───────────────────────────────────────────────────────────

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

    // ── Transcode, probe, subtitles ─────────────────────────────────────────

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

    /**
     * The fallback for codecs no browser decodes. Output is fragmented MP4 sent
     * as it is produced, so playback starts before the encode finishes; the
     * child process dies with the request.
     */
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

        // A transcode has no known length and is not seekable by byte range;
        // the client seeks by restarting with a new `start`.
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

    // ── Thumbnails ──────────────────────────────────────────────────────────

    app.get<{ Querystring: { path: string; token?: string; width?: number; quality?: number } }>(
      '/thumbnail',
      {
        schema: {
          querystring: {
            ...pathQuerySchema,
            properties: {
              ...pathQuerySchema.properties,
              width: { type: 'integer', minimum: 16, maximum: 2048, default: 320 },
              quality: { type: 'integer', minimum: 1, maximum: 100, default: 72 },
            },
          },
        },
        config: streamConfig,
      },
      async (request, reply) => {
        const target = request.resolvePath(request.query.path, 'read');
        await listing.assertFile(target);

        const thumbnail = await thumbnails.render(
          target,
          { width: request.query.width ?? 320, quality: request.query.quality ?? 72 },
          abortSignalOf(request),
        );

        // Keyed by content identity, so it can be cached hard.
        return reply
          .header('Content-Type', 'image/webp')
          .header('Cache-Control', 'private, max-age=86400, immutable')
          .send(thumbnail);
      },
    );

    // ── Text ────────────────────────────────────────────────────────────────

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
        // Editing a large file needs a larger body than the API default.
        bodyLimit: 32 * 1024 * 1024,
      },
      async request => {
        const target = request.resolvePath(request.body.path, 'write');
        await text.write(target, request.body.content, request.body.encoding);
        return { ok: true };
      },
    );

    // ── Comics ──────────────────────────────────────────────────────────────

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

    /**
     * Pages are served from the extraction cache. The key alone is not a
     * capability: it is derived from a path the requester had to be authorised
     * to read in order to obtain, and the page name is checked against the
     * manifest rather than joined blindly.
     */
    app.get<{ Params: { key: string; page: string } }>(
      '/comic/:key/:page',
      { config: streamConfig },
      async (request, reply) =>
        streams.sendGenerated(reply, await comics.pagePath(request.params.key, request.params.page)),
    );

    // ── Documents ───────────────────────────────────────────────────────────

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

    // ── Backgrounds ─────────────────────────────────────────────────────────

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
