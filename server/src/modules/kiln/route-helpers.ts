import type { Readable } from 'node:stream';

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { ListingService } from '../vault/listing.service.js';
import type { ArchiveMemberService } from './archive-member.service.js';
import type { OpenedFile } from './stream.service.js';

const PATH_PROPERTIES = {
  path: { type: 'string', maxLength: 4096 },
  /** A file inside the archive `path` names; only routes with `member: true` take it. */
  member: { type: 'string', minLength: 1, maxLength: 4096 },
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
/** The same, for routes that open the file they name through `openFile`, archive members included. */
export const READ_FILE = { ...READ, member: true };
export const STREAM_FILE = { ...STREAM, member: true };

export interface FileSources {
  listing: ListingService;
  members: ArchiveMemberService;
}

/**
 * The file a request names, checked readable and a file (not a folder). With
 * `member`, the file of that name inside the archive `path` names, unpacked to
 * a cache: the archive's read permission covers what is inside it.
 */
export async function openFile(
  { listing, members }: FileSources,
  request: FastifyRequest,
  path: string,
): Promise<OpenedFile> {
  const target = request.resolvePath(path, 'read');
  const entry = await listing.assertFile(target);
  const { member } = request.query as { member?: string };
  return member ? members.open(target, entry, member) : { target, entry };
}

/**
 * A conversion as ffmpeg produces it. Not byte-seekable and never the same
 * twice: the client seeks by asking again with a new `start`.
 */
export function sendConversion(reply: FastifyReply, stream: Readable, contentType: string) {
  return reply
    .header('Content-Type', contentType)
    .header('Cache-Control', 'no-store')
    .header('Accept-Ranges', 'none')
    .send(stream);
}
