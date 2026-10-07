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
      limit: pageSize(request.query.limit, app.hearth.runtime.get('listingMaxEntries')),
    });

    /** Search as this user: results they may not read are left out, and leaving stops the search. */
    const searchFor = (request: FastifyRequest, query: SearchQuery): Promise<SearchResponse> =>
      beacon.search(query, readFilterFor(request), abortSignalOf(request));

    app.get<{ Querystring: SearchQueryString }>(
      '/search',
      { schema: { querystring: querySchema }, config },
      async request => {
        const query = queryFrom(request);
        if (!query.text.trim() && !query.type)
          throw HearthError.badRequest('Type something to search for');
        return searchFor(request, query);
      },
    );

    /** Every file of one media kind under a folder. */
    app.get<{ Params: { kind: string }; Querystring: SearchQueryString }>(
      '/media/:kind',
      { schema: { querystring: querySchema }, config },
      async request =>
        searchFor(request, {
          ...queryFrom(request, parseMediaKind(request.params.kind)),
          text: '',
        }),
    );

    app.get<{ Params: { kind: string }; Querystring: { path?: string } }>(
      '/media/:kind/random',
      { config },
      async request => {
        const kind = parseMediaKind(request.params.kind);
        const scope = request.relativePath(request.resolvePath(request.query.path, 'read'));
        const entry = await randomEntry(kind, scope, query => searchFor(request, query));
        if (!entry) throw HearthError.notFound(`No ${kind} files here`);
        return entry;
      },
    );
    // Everything's address and health are for an administrator, like the rest of the settings.
    app.get('/system/search-status', { config: { permission: 'admin' } }, async () =>
      beacon.status(),
    );
  };
}

/**
 * Two lookups (the size of the collection, then one entry at a random
 * offset), so the set is never materialised.
 */
async function randomEntry(
  kind: MediaKind,
  scope: string,
  search: (query: SearchQuery) => Promise<SearchResponse>,
) {
  const base: SearchQuery = {
    text: '',
    scope,
    type: kind,
    recursive: true,
    sort: { field: 'name', direction: 'asc' },
    page: 1,
    limit: 1,
  };
  const probe = await search(base);
  if (probe.total === 0) return null;
  const picked = await search({ ...base, page: Math.floor(Math.random() * probe.total) + 1 });
  return picked.items[0] ?? probe.items[0] ?? null;
}
function parseMediaKind(raw: string): MediaKind {
  if ((MEDIA_KINDS as readonly string[]).includes(raw)) return raw as MediaKind;
  throw HearthError.badRequest(`Unknown media kind "${raw}"`);
}
