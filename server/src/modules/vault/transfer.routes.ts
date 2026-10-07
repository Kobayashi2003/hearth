import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type {
  ChunkedUploadInitRequest,
  UploadResponse,
  ZipRequest,
  ZipTokenResponse,
} from '@hearth/shared';

import { HearthError } from '../../lib/errors.js';
import { isoOrNull, maxItems } from '../../lib/limits.js';
import { usernameOf } from '../../lib/request.js';
import { buildRateLimits } from '../../plugins/rate-limit.js';
import { contentDisposition, type StreamService } from '../kiln/stream.service.js';
import type { ChunkedUploadService } from './chunked-upload.service.js';
import { type DownloadService, suggestArchiveName } from './download.service.js';
import type { ListingService } from './listing.service.js';
import type { StoredUpload, UploadService } from './upload.service.js';

const schemasFor = (batch: number) =>
  ({
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
          paths: { type: 'array', minItems: 1, ...maxItems(batch), items: { type: 'string' } },
          name: { type: 'string', maxLength: 200 },
        },
      },
    },
  }) as const;

/** Field names that carry no path information and defer to the filename. */
const GENERIC_UPLOAD_FIELDS = new Set(['file', 'files']);

export function uploadRelativeName(fieldName: string, filename: string | undefined): string {
  if (fieldName && !GENERIC_UPLOAD_FIELDS.has(fieldName)) return fieldName;
  if (!filename) throw HearthError.badRequest('Upload is missing a filename');
  return filename;
}

interface TransferServices {
  uploads: UploadService;
  chunked: ChunkedUploadService;
  downloads: DownloadService;
  listing: ListingService;
  streams: StreamService;
}

/** Bytes in (whole files, or in chunks that survive a dropped connection) and out (a file, or a zip of many). */
export function createTransferRoutes(services: TransferServices): FastifyPluginAsync {
  return async app => {
    await app.register(uploadRoutes(services));
    await app.register(chunkedRoutes(services));
    await app.register(downloadRoutes(services));
  };
}

function writeConfigFor(app: FastifyInstance) {
  return { permission: 'write' as const, rateLimit: buildRateLimits(app.hearth.config).write };
}

function uploadRoutes({ uploads, listing }: TransferServices): FastifyPluginAsync {
  return async app => {
    const { config } = app.hearth;
    const writeConfig = writeConfigFor(app);

    /**
     * Browsers strip directory segments from a multipart filename, so the field
     * name carries the destination-relative path; `file` / `files` mean "just
     * use the filename".
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
            await uploads.store(
              directory,
              uploadRelativeName(part.fieldname, part.filename),
              part.file,
            ),
          );
        }

        if (stored.length === 0) throw HearthError.badRequest('No files were uploaded');
        const body: UploadResponse = { files: stored };
        return body;
      },
    );
  };
}

function chunkedRoutes({ chunked, listing }: TransferServices): FastifyPluginAsync {
  return async app => {
    const schemas = schemasFor(app.hearth.config.listing.maxBatchItems);
    const writeConfig = writeConfigFor(app);

    app.post<{ Body: ChunkedUploadInitRequest }>(
      '/upload/chunked/init',
      { schema: schemas.chunkInit, config: writeConfig },
      async request => {
        const directory = request.resolvePath(request.body.path, 'write');
        await listing.assertDirectory(directory);
        const { relativePath, size, chunkSize } = request.body;
        return chunked.begin(usernameOf(request), directory, { relativePath, size, chunkSize });
      },
    );

    app.post<{ Params: { uploadId: string; index: string } }>(
      '/upload/chunked/:uploadId/:index',
      { config: writeConfig },
      async request => {
        const part = await request.file();
        if (!part) throw HearthError.badRequest('Chunk body is missing');
        return chunked.acceptChunk(
          usernameOf(request),
          request.params.uploadId,
          Number.parseInt(request.params.index, 10),
          part.file,
        );
      },
    );

    app.get<{ Params: { uploadId: string } }>(
      '/upload/chunked/:uploadId',
      { config: { permission: 'write' } },
      async request => chunked.status(usernameOf(request), request.params.uploadId),
    );

    app.post<{ Params: { uploadId: string } }>(
      '/upload/chunked/:uploadId/complete',
      { config: writeConfig },
      async request => {
        const file = await chunked.complete(usernameOf(request), request.params.uploadId);
        const body: UploadResponse = { files: [file] };
        return body;
      },
    );

    app.delete<{ Params: { uploadId: string } }>(
      '/upload/chunked/:uploadId',
      { config: writeConfig },
      async request => {
        await chunked.abort(usernameOf(request), request.params.uploadId);
        return { ok: true };
      },
    );
  };
}

function downloadRoutes({ downloads, listing, streams }: TransferServices): FastifyPluginAsync {
  return async app => {
    const { config, runtime } = app.hearth;
    const schemas = schemasFor(config.listing.maxBatchItems);

    app.route<{ Querystring: { path: string; token?: string } }>({
      method: ['GET', 'HEAD'],
      url: '/download',
      config: { auth: 'media-token', permission: 'read' },
      handler: async (request, reply) => {
        const target = request.resolvePath(request.query.path, 'read');
        const entry = await listing.assertFile(target);
        return streams.send(request, reply, { target, entry }, { download: true });
      },
    });

    app.post<{ Body: ZipRequest }>(
      '/download/zip',
      { schema: schemas.zip, config: { permission: 'read' } },
      async request => {
        // Authorised now, so redemption cannot reach anything the requester could not read.
        const relativePaths = request.body.paths.map(candidate =>
          request.relativePath(request.resolvePath(candidate, 'read')),
        );

        const { token, expiresAt } = downloads.issueZipTicket(
          usernameOf(request),
          relativePaths,
          suggestArchiveName(relativePaths, request.body.name),
          runtime.get('activeRootId'),
        );

        const body: ZipTokenResponse = { token, expiresAt: isoOrNull(expiresAt) };
        return body;
      },
    );

    /**
     * A plain navigation, so the browser owns the save dialog. The single-use,
     * five-minute ticket is the credential.
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
          .header('Cache-Control', 'no-store');

        return reply.send(await downloads.createZipStream(sources, controller.signal));
      },
    );
  };
}
