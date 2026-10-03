import type { FastifyPluginAsync } from 'fastify';
import type { ListResponse, SortDirection, SortField } from '@hearth/shared';
import { SORT_DIRECTIONS, SORT_FIELDS } from '@hearth/shared';

import { pageSize, paginate, sortEntries } from '../../lib/listing.js';
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
    limit: { type: 'integer', minimum: 1 },
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

        const sorted = sortEntries(
          await listing.readDirectory(directory),
          request.query.sort ?? 'name',
          request.query.direction ?? 'asc',
        );
        const body: ListResponse = {
          ...paginate(
            sorted,
            request.query.page,
            pageSize(request.query.limit, app.hearth.runtime.get('listingMaxEntries')),
          ),
          path: request.relativePath(directory),
        };
        return body;
      },
    );
  };
}
