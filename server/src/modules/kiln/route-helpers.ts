import type { FastifyRequest } from 'fastify';

import type { ListingService } from '../vault/listing.service.js';
import type { OpenedFile } from './stream.service.js';

const PATH_PROPERTIES = {
  path: { type: 'string', maxLength: 4096 },
  // Media URLs carry their token in the query: <video> and <img> cannot send headers.
  token: { type: 'string', maxLength: 1024 },
} as const;

/** A querystring naming a file, plus whatever else the route takes. */
export function pathQuery(
  extra: Record<string, object> = {},
  required: readonly string[] = ['path'],
) {
  return {
    type: 'object',
    required,
    properties: { ...PATH_PROPERTIES, ...extra },
  } as const;
}

export const READ = { permission: 'read' as const };
/** Read access for URLs a browser element fetches itself, authorised by a media token. */
export const STREAM = { auth: 'media-token' as const, permission: 'read' as const };

/** The file a request names, checked readable and a file (not a folder). */
export async function openFile(
  listing: ListingService,
  request: FastifyRequest,
  path: string,
): Promise<OpenedFile> {
  const target = request.resolvePath(path, 'read');
  return { target, entry: await listing.assertFile(target) };
}
