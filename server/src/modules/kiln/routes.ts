import type { FastifyPluginAsync } from 'fastify';

import type { ListingService } from '../vault/listing.service.js';
import type { StreamService } from './stream.service.js';

interface RawQuery {
  path: string;
  /** Present when the browser cannot send the session cookie with the request. */
  token?: string;
}

const rawQuerySchema = {
  type: 'object',
  required: ['path'],
  properties: {
    path: { type: 'string', maxLength: 4096 },
    token: { type: 'string', maxLength: 1024 },
  },
} as const;

export function createKilnRoutes(
  listing: ListingService,
  streams: StreamService,
): FastifyPluginAsync {
  return async app => {
    app.route<{ Querystring: RawQuery }>({
      method: ['GET', 'HEAD'],
      url: '/media/raw',
      schema: { querystring: rawQuerySchema },
      config: { auth: 'media-token', permission: 'read' },
      handler: async (request, reply) => {
        const target = request.resolvePath(request.query.path, 'read');
        const entry = await listing.assertFile(target);
        return streams.send(request, reply, target, entry);
      },
    });
  };
}
