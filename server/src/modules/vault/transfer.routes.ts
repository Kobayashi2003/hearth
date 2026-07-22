import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type {
  ChunkedUploadInitRequest,
  UploadResponse,
  ZipRequest,
  ZipTokenResponse,
} from '@hearth/shared';

import { HearthError } from '../../lib/errors.js';
import { buildRateLimits } from '../../plugins/rate-limit.js';
import { contentDisposition, type StreamService } from '../kiln/stream.service.js';
import type { ChunkedUploadService } from './chunked-upload.service.js';
import { type DownloadService, suggestArchiveName } from './download.service.js';
import type { ListingService } from './listing.service.js';
import type { StoredUpload, UploadService } from './upload.service.js';

const schemas = {
  chunkInit: {
    body: {
      type: 'object',
      required: ['path', 'relativePath', 'size', 'chunkSize'],
      properties: {
        path: { type: 'string' },
        relativePath: { type: 'string', minLength: 1 },
        size: { type: 'integer', minimum: 0 },
        chunkSize: { type: 'integer', minimum: 0 },
      },
    },
  },
  zip: {
    body: {
      type: 'object',
      required: ['paths'],
      properties: {
        paths: { type: 'array', minItems: 1, maxItems: 1000, items: { type: 'string' } },
        name: { type: 'string', maxLength: 200 },
      },
    },
  },
} as const;

function requireSession(request: FastifyRequest): { username: string } {
  if (!request.session) throw HearthError.unauthorized();
  return request.session;
}

/** Field names that carry no path information and defer to the filename. */
const GENERIC_UPLOAD_FIELDS = new Set(['file', 'files']);

export function uploadRelativeName(fieldName: string, filename: string | undefined): string {
  if (fieldName && !GENERIC_UPLOAD_FIELDS.has(fieldName)) return fieldName;
  if (!filename) throw HearthError.badRequest('Upload is missing a filename');
  return filename;
}

export function createTransferRoutes(
  uploads: UploadService,
  chunked: ChunkedUploadService,
  downloads: DownloadService,
  listing: ListingService,
  streams: StreamService,
): FastifyPluginAsync {
  return async app => {
    const { config, runtime } = app.hearth;
    const rateLimits = buildRateLimits(config);
    const writeConfig = { permission: 'write' as const, rateLimit: rateLimits.write };

    // ── Upload ──────────────────────────────────────────────────────────────

    /**
     * Multi-file and folder upload share one endpoint.
     *
     * Browsers strip directory segments from a multipart filename, so the
     * relative path cannot travel there. The protocol is instead: **the field
     * name carries the destination-relative path**, with the reserved names
     * `file` and `files` meaning "just use the filename". A folder upload sends
     * `webkitRelativePath` as the field name; a flat upload sends `files`.
     */
    app.post<{ Querystring: { path?: string } }>(
      '/upload',
      { config: writeConfig },
      async request => {
        const directory = request.resolvePath(request.query.path, 'write');
        await listing.assertDirectory(directory);

        const stored: StoredUpload[] = [];
        const maxFiles = config.upload.maxFilesPerRequest;

        for await (const part of request.parts()) {
          if (part.type !== 'file') continue;
          if (maxFiles > 0 && stored.length >= maxFiles) {
            throw HearthError.badRequest(`At most ${maxFiles} files may be uploaded at once`);
          }
          stored.push(
            await uploads.store(directory, uploadRelativeName(part.fieldname, part.filename), part.file),
          );
        }

        if (stored.length === 0) throw HearthError.badRequest('No files were uploaded');
        const body: UploadResponse = { files: stored };
        return body;
      },
    );

    app.post<{ Body: ChunkedUploadInitRequest }>(
      '/upload/chunked/init',
      { schema: schemas.chunkInit, config: writeConfig },
      async request => {
        const directory = request.resolvePath(request.body.path, 'write');
        await listing.assertDirectory(directory);
        return chunked.begin(
          requireSession(request).username,
          directory,
          request.body.relativePath,
          request.body.size,
          request.body.chunkSize,
        );
      },
    );

    app.post<{ Params: { uploadId: string; index: string } }>(
      '/upload/chunked/:uploadId/:index',
      { config: writeConfig },
      async request => {
        const part = await request.file();
        if (!part) throw HearthError.badRequest('Chunk body is missing');
        return chunked.acceptChunk(
          requireSession(request).username,
          request.params.uploadId,
          Number.parseInt(request.params.index, 10),
          part.file,
        );
      },
    );

    app.get<{ Params: { uploadId: string } }>(
      '/upload/chunked/:uploadId',
      { config: { permission: 'write' } },
      async request => chunked.status(requireSession(request).username, request.params.uploadId),
    );

    app.post<{ Params: { uploadId: string } }>(
      '/upload/chunked/:uploadId/complete',
      { config: writeConfig },
      async request => {
        const file = await chunked.complete(
          requireSession(request).username,
          request.params.uploadId,
        );
        const body: UploadResponse = { files: [file] };
        return body;
      },
    );

    app.delete<{ Params: { uploadId: string } }>(
      '/upload/chunked/:uploadId',
      { config: writeConfig },
      async request => {
        await chunked.abort(requireSession(request).username, request.params.uploadId);
        return { ok: true };
      },
    );

    // ── Download ────────────────────────────────────────────────────────────

    app.route<{ Querystring: { path: string; token?: string } }>({
      method: ['GET', 'HEAD'],
      url: '/download',
      config: { auth: 'media-token', permission: 'read' },
      handler: async (request, reply) => {
        const target = request.resolvePath(request.query.path, 'read');
        const entry = await listing.assertFile(target);
        return streams.send(request, reply, target, entry, { download: true });
      },
    });

    app.post<{ Body: ZipRequest }>(
      '/download/zip',
      { schema: schemas.zip, config: { permission: 'read' } },
      async request => {
        // Authorise every path now, so redemption cannot reach anything the
        // requester was not allowed to read at the moment they asked.
        const relativePaths = request.body.paths.map(candidate =>
          request.relativePath(request.resolvePath(candidate, 'read')),
        );

        const { token, expiresAt } = downloads.issueZipTicket(
          requireSession(request).username,
          relativePaths,
          suggestArchiveName(relativePaths, request.body.name),
          runtime.get('activeRootId'),
        );

        const body: ZipTokenResponse = { token, expiresAt: expiresAt.toISOString() };
        return body;
      },
    );

    /**
     * A plain navigation, so the browser owns the save dialog and progress UI.
     * The ticket is the credential: 192 random bits, single-use, valid for five
     * minutes, and carrying only paths the issuing session was already
     * authorised to read.
     */
    app.get<{ Params: { token: string } }>(
      '/download/zip/:token',
      { config: { auth: 'public' } },
      async (request, reply) => {
        const ticket = downloads.redeem(request.params.token, runtime.get('activeRootId'));
        const sources = downloads.resolveTicketPaths(ticket);

        const controller = new AbortController();
        request.raw.on('close', () => {
          if (!reply.raw.writableEnded) controller.abort();
        });

        reply
          .header('Content-Type', 'application/zip')
          .header('Content-Disposition', contentDisposition(`${ticket.archiveName}.zip`))
          // The final size is unknown until the archive is written, so the
          // browser shows indeterminate progress rather than a wrong estimate.
          .header('Cache-Control', 'no-store');

        return reply.send(await downloads.createZipStream(sources, controller.signal));
      },
    );
  };
}
