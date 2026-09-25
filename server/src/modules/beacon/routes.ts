import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { MEDIA_KINDS, type MediaKind, type SearchResponse } from '@hearth/shared';

import { HearthError } from '../../lib/errors.js';
import { pageSize } from '../../lib/listing.js';
import { abortSignalOf } from '../../lib/request.js';
import { buildRateLimits } from '../../plugins/rate-limit.js';
import { listingQuerySchema, type ListQueryString } from '../vault/routes.js';
import type { Beacon } from './beacon.js';
import type { SearchQuery } from './provider.js';

interface SearchQueryString extends ListQueryString {
  q?: string;
  recursive?: boolean;
  type?: MediaKind;
}

function searchQuerySchema(maxQueryLength: number) {
  return {
    type: 'object',
    properties: {
      ...listingQuerySchema.properties,
      q: {
        type: 'string',
        ...(Number.isFinite(maxQueryLength) ? { maxLength: maxQueryLength } : {}),
      },
      recursive: { type: 'boolean', default: true },
      type: { type: 'string', enum: MEDIA_KINDS as unknown as string[] },
    },
  } as const;
}

export function createBeaconRoutes(beacon: Beacon): FastifyPluginAsync {
  return async app => {
    const rateLimits = buildRateLimits(app.hearth.config);
    const { warden, config: appConfig } = app.hearth;
    const querySchema = searchQuerySchema(appConfig.search.maxQueryLength);
    const config = { permission: 'read' as const, rateLimit: rateLimits.search };

    // Applied per result: a readable scope may contain subtrees the user is denied.
    const readFilterFor = (request: FastifyRequest) => (relativePath: string) =>
      request.session !== null && warden.can(request.session, 'read', relativePath);

    const queryFrom = (
      request: FastifyRequest<{ Querystring: SearchQueryString }>,
      type?: MediaKind,
    ): SearchQuery => ({
      text: request.query.q ?? '',
      scope: request.relativePath(request.resolvePath(request.query.path, 'read')),
      type: type ?? request.query.type,
      recursive: request.query.recursive ?? true,
      sort: { field: request.query.sort ?? 'name', direction: request.query.direction ?? 'asc' },
      page: request.query.page ?? 1,
      limit: pageSize(request.query.limit, appConfig.listing.maxEntries),
    });

    app.get<{ Querystring: SearchQueryString }>(
      '/search',
      { schema: { querystring: querySchema }, config },
      async request => {
        const query = queryFrom(request);
        if (!query.text.trim() && !query.type)
          throw HearthError.badRequest('Type something to search for');
        const body: SearchResponse = await beacon.search(
          query,
          readFilterFor(request),
          abortSignalOf(request),
        );
        return body;
      },
    );

    /** Every file of one media kind under a folder. */
    app.get<{ Params: { kind: string }; Querystring: SearchQueryString }>(
      '/media/:kind',
      { schema: { querystring: querySchema }, config },
      async request => {
        const query = { ...queryFrom(request, parseMediaKind(request.params.kind)), text: '' };
        const body: SearchResponse = await beacon.search(
          query,
          readFilterFor(request),
          abortSignalOf(request),
        );
        return body;
      },
    );

    /** Two lookups — the size of the collection, then one entry at a random offset — so the set is never materialised. */
    app.get<{ Params: { kind: string }; Querystring: { path?: string } }>(
      '/media/:kind/random',
      { config },
      async request => {
        const kind = parseMediaKind(request.params.kind);
        const base: SearchQuery = {
          text: '',
          scope: request.relativePath(request.resolvePath(request.query.path, 'read')),
          type: kind,
          recursive: true,
          sort: { field: 'name', direction: 'asc' },
          page: 1,
          limit: 1,
        };
        const canRead = readFilterFor(request);
        const signal = abortSignalOf(request);

        const probe = await beacon.search(base, canRead, signal);
        if (probe.total === 0) throw HearthError.notFound(`No ${kind} files here`);
        const picked = await beacon.search(
          { ...base, page: Math.floor(Math.random() * probe.total) + 1 },
          canRead,
          signal,
        );
        const entry = picked.items[0] ?? probe.items[0];
        if (!entry) throw HearthError.notFound(`No ${kind} files here`);
        return entry;
      },
    );

    app.get('/system/search-status', { config: { permission: 'read' } }, async () =>
      beacon.status(),
    );
  };
}

function parseMediaKind(raw: string): MediaKind {
  if ((MEDIA_KINDS as readonly string[]).includes(raw)) return raw as MediaKind;
  throw HearthError.badRequest(`Unknown media kind "${raw}"`);
}
