import type { FastifyPluginAsync } from 'fastify';
import type {
  ArchiveListing,
  ComicManifest,
  OfficeContentResponse,
  TextContentResponse,
  TextWriteRequest,
} from '@hearth/shared';

import { decodeText } from '../../lib/charset.js';
import { bodyLimit } from '../../lib/limits.js';
import { inlineSafetyHeaders, mimeForPath } from '../../lib/mime.js';
import { abortSignalOf } from '../../lib/request.js';
import { buildRateLimits } from '../../plugins/rate-limit.js';
import type { ListingService } from '../vault/listing.service.js';
import type { ArchiveService } from './archive.service.js';
import type { BackgroundService } from './background.service.js';
import type { ComicService } from './comic.service.js';
import type { DocumentService } from './document.service.js';
import { openFile, pathQuery, READ, STREAM } from './route-helpers.js';
import { contentDisposition, type StreamService } from './stream.service.js';
import type { TextService } from './text.service.js';

export interface DocumentRouteServices {
  listing: ListingService;
  streams: StreamService;
  text: TextService;
  comics: ComicService;
  archives: ArchiveService;
  documents: DocumentService;
  backgrounds: BackgroundService;
}

/** Files the client renders itself: text, comics, archives, Office and HTML documents. */
export function createDocumentRoutes(services: DocumentRouteServices): FastifyPluginAsync {
  const { listing, streams, text, comics, archives, documents, backgrounds } = services;

  return async app => {
    const rateLimits = buildRateLimits(app.hearth.config);

    app.get<{ Querystring: { path: string; encoding?: string } }>(
      '/content',
      {
        schema: { querystring: pathQuery({ encoding: { type: 'string', maxLength: 32 } }) },
        config: READ,
      },
      async request => {
        const { target } = await openFile(listing, request, request.query.path);
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
      { schema: { querystring: pathQuery() }, config: READ },
      async request => {
        const { target } = await openFile(listing, request, request.query.path);
        const body: ComicManifest = await comics.open(target, abortSignalOf(request));
        return body;
      },
    );

    /** The page name is checked against the cached manifest, never joined blindly. */
    app.get<{ Params: { key: string; page: string } }>(
      '/comic/:key/:page',
      { config: STREAM },
      async (request, reply) =>
        streams.sendGenerated(
          reply,
          await comics.pagePath(request.params.key, request.params.page),
        ),
    );

    app.get<{ Querystring: { path: string } }>(
      '/archive',
      { schema: { querystring: pathQuery() }, config: READ },
      async request => {
        const { target } = await openFile(listing, request, request.query.path);
        const body: ArchiveListing = await archives.list(target, abortSignalOf(request));
        return body;
      },
    );

    /** One member, extracted on demand; the name is matched against the archive listing. */
    app.get<{ Querystring: { path: string; entry: string; token?: string } }>(
      '/archive/entry',
      {
        schema: {
          querystring: pathQuery({ entry: { type: 'string', maxLength: 4096 } }, ['path', 'entry']),
        },
        config: STREAM,
      },
      async (request, reply) => {
        const { target } = await openFile(listing, request, request.query.path);
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
      { schema: { querystring: pathQuery() }, config: READ },
      async request => {
        const { target } = await openFile(listing, request, request.query.path);
        const body: OfficeContentResponse = await documents.renderOffice(
          target,
          abortSignalOf(request),
        );
        return body;
      },
    );

    app.get<{ Querystring: { path: string } }>(
      '/html-proxy',
      { schema: { querystring: pathQuery() }, config: READ },
      async request => {
        const { target } = await openFile(listing, request, request.query.path);
        return documents.renderHtml(target);
      },
    );

    app.get('/backgrounds', { config: READ }, async () => ({
      backgrounds: await backgrounds.list(),
    }));

    app.get<{ Querystring: { name?: string; token?: string } }>(
      '/background',
      { config: STREAM },
      async (request, reply) => {
        const name = request.query.name ?? (await backgrounds.pickRandom());
        return streams.sendGenerated(reply, await backgrounds.resolve(name), name);
      },
    );
  };
}
