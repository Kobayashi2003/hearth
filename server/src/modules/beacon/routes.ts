import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { MEDIA_KINDS, type MediaKind, type SearchResponse } from '@hearth/shared';

import { HearthError } from '../../lib/errors.js';
import { clampLimit } from '../../lib/listing.js';
import { buildRateLimits } from '../../plugins/rate-limit.js';
import { listingQuerySchema, type ListQueryString } from '../vault/routes.js';
import type { Beacon } from './beacon.js';
import type { SearchQuery } from './provider.js';

interface SearchQueryString extends ListQueryString {
  q: string;
  recursive?: boolean;
  type?: MediaKind;
}

const searchQuerySchema = {
  type: 'object',
  required: ['q'],
  properties: {
    ...listingQuerySchema.properties,
    q: { type: 'string', maxLength: 512 },
    recursive: { type: 'boolean', default: true },
    type: { type: 'string', enum: MEDIA_KINDS as unknown as string[] },
  },
} as const;

const collectionQuerySchema = {
  type: 'object',
  properties: {
    ...listingQuerySchema.properties,
    recursive: { type: 'boolean', default: true },
  },
} as const;

/**
 * The client aborting a request must stop the work it started; a search over a
 * large tree is expensive enough that finishing it for nobody matters.
 */
function abortSignalOf(request: FastifyRequest): AbortSignal {
  const controller = new AbortController();
  request.raw.on('close', () => {
    if (!request.raw.readableEnded) controller.abort();
  });
  return controller.signal;
}

export function createBeaconRoutes(beacon: Beacon): FastifyPluginAsync {
  return async app => {
    const rateLimits = buildRateLimits(app.hearth.config);
    const { warden } = app.hearth;

    /** Per-result read check, so a search cannot list a denied subtree. */
    const readFilterFor = (request: FastifyRequest) => (relativePath: string) =>
      request.session !== null && warden.can(request.session, 'read', relativePath);

    app.get<{ Querystring: SearchQueryString }>(
      '/search',
      {
        schema: { querystring: searchQuerySchema },
        config: { permission: 'read', rateLimit: rateLimits.search },
      },
      async request => {
        // Resolving the scope authorises it, so a search cannot reach into a
        // directory the user may not read.
        const scope = request.relativePath(request.resolvePath(request.query.path, 'read'));

        const query: SearchQuery = {
          text: request.query.q,
          scope,
          type: request.query.type,
          recursive: request.query.recursive ?? true,
          sort: {
            field: request.query.sort ?? 'name',
            direction: request.query.direction ?? 'asc',
          },
          page: request.query.page ?? 1,
          limit: clampLimit(request.query.limit),
        };

        const result = await beacon.search(query, readFilterFor(request), abortSignalOf(request));
        const body: SearchResponse = result;
        return body;
      },
    );

    // An empty search text under a media-kind filter lists every item of that
    // kind — the collection views the client builds galleries from.
    app.get<{ Params: { kind: string }; Querystring: ListQueryString & { recursive?: boolean } }>(
      '/media/:kind',
      {
        schema: { querystring: collectionQuerySchema },
        config: { permission: 'read', rateLimit: rateLimits.search },
      },
      async request => {
        const kind = parseMediaKind(request.params.kind);
        const scope = request.relativePath(request.resolvePath(request.query.path, 'read'));

        const result = await beacon.search(
          {
            text: '',
            scope,
            type: kind,
            recursive: request.query.recursive ?? true,
            sort: {
              field: request.query.sort ?? 'name',
              direction: request.query.direction ?? 'asc',
            },
            page: request.query.page ?? 1,
            limit: clampLimit(request.query.limit),
          },
          readFilterFor(request),
          abortSignalOf(request),
        );

        const body: SearchResponse = result;
        return body;
      },
    );

    app.get<{ Params: { kind: string }; Querystring: { path?: string } }>(
      '/media/:kind/random',
      { config: { permission: 'read', rateLimit: rateLimits.search } },
      async request => {
        const kind = parseMediaKind(request.params.kind);
        const scope = request.relativePath(request.resolvePath(request.query.path, 'read'));
        const signal = abortSignalOf(request);

        const baseQuery: SearchQuery = {
          text: '',
          scope,
          type: kind,
          recursive: true,
          sort: { field: 'name', direction: 'asc' },
          page: 1,
          limit: 1,
        };

        // One request to learn the size of the collection, a second to fetch a
        // single entry at a random offset — the whole set is never materialised.
        const canRead = readFilterFor(request);
        const probe = await beacon.search(baseQuery, canRead, signal);
        if (probe.total === 0) throw HearthError.notFound(`No ${kind} files here`);

        const offset = Math.floor(Math.random() * probe.total);
        const picked = await beacon.search({ ...baseQuery, page: offset + 1 }, canRead, signal);
        const entry = picked.items[0] ?? probe.items[0];
        if (!entry) throw HearthError.notFound(`No ${kind} files here`);
        return entry;
      },
    );

    app.get('/system/search-status', { config: { permission: 'read' } }, async () => beacon.status());
  };
}

function parseMediaKind(raw: string): MediaKind {
  if ((MEDIA_KINDS as readonly string[]).includes(raw)) return raw as MediaKind;
  throw HearthError.badRequest(`Unknown media kind "${raw}"`);
}
