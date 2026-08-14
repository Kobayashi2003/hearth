import type { FastifyPluginAsync } from 'fastify';
import type { ListResponse, SortDirection, SortField } from '@hearth/shared';
import { MAX_PAGE_SIZE, SORT_DIRECTIONS, SORT_FIELDS } from '@hearth/shared';

import { paginate, sortEntries } from '../../lib/listing.js';
import type { ListingService } from './listing.service.js';

export interface ListQueryString {
  path?: string;
  sort?: SortField;
  direction?: SortDirection;
  page?: number;
  limit?: number;
}

/** Shared by directory listing, search, and media collections. */
export const listingQuerySchema = {
  type: 'object',
  properties: {
    path: { type: 'string', maxLength: 4096 },
    sort: { type: 'string', enum: SORT_FIELDS as unknown as string[] },
    direction: { type: 'string', enum: SORT_DIRECTIONS as unknown as string[] },
    page: { type: 'integer', minimum: 1 },
    limit: { type: 'integer', minimum: 1, maximum: MAX_PAGE_SIZE },
  },
} as const;

export function createVaultRoutes(listing: ListingService): FastifyPluginAsync {
  return async app => {
    app.get<{ Querystring: ListQueryString }>(
      '/files',
      { schema: { querystring: listingQuerySchema }, config: { permission: 'read' } },
      async request => {
        const directory = request.resolvePath(request.query.path, 'read');
        await listing.assertDirectory(directory);

        const entries = await listing.readDirectory(directory);
        const sorted = sortEntries(
          entries,
          request.query.sort ?? 'name',
          request.query.direction ?? 'asc',
        );
        const page = paginate(sorted, request.query.page, request.query.limit);

        const body: ListResponse = { ...page, path: request.relativePath(directory) };
        return body;
      },
    );

    /**
     * One entry by path. Ledger records only paths, so anything resuming from
     * it — the continue-reading rail — needs a way back to a full entry without
     * listing the whole containing folder.
     */
    app.get<{ Querystring: { path?: string } }>(
      '/files/entry',
      {
        schema: {
          querystring: {
            type: 'object',
            required: ['path'],
            properties: { path: { type: 'string', maxLength: 4096 } },
          },
        },
        config: { permission: 'read' },
      },
      async request => {
        const target = request.resolvePath(request.query.path, 'read');
        return listing.require(target);
      },
    );
  };
}
