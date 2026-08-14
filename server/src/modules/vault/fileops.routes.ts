import type { FastifyPluginAsync } from 'fastify';
import type {
  DeleteRequest,
  MkdirRequest,
  OperationResponse,
  RenameRequest,
  TransferRequest,
} from '@hearth/shared';

import { HearthError } from '../../lib/errors.js';
import { buildRateLimits } from '../../plugins/rate-limit.js';
import type { TrashService } from '../ember/trash.service.js';
import type { LedgerService } from '../ledger/ledger.service.js';
import type { FileOpsService } from './fileops.service.js';
import type { ListingService } from './listing.service.js';

const pathList = { type: 'array', minItems: 1, maxItems: 1000, items: { type: 'string' } } as const;

const schemas = {
  mkdir: {
    body: {
      type: 'object',
      required: ['path', 'name'],
      properties: { path: { type: 'string' }, name: { type: 'string', minLength: 1 } },
    },
  },
  rename: {
    body: {
      type: 'object',
      required: ['path', 'name'],
      properties: { path: { type: 'string' }, name: { type: 'string', minLength: 1 } },
    },
  },
  transfer: {
    body: {
      type: 'object',
      required: ['sources', 'destination'],
      properties: { sources: pathList, destination: { type: 'string' } },
    },
  },
  remove: {
    body: {
      type: 'object',
      required: ['paths'],
      properties: { paths: pathList, permanent: { type: 'boolean' } },
    },
  },
} as const;

export function createFileOpsRoutes(
  fileOps: FileOpsService,
  listing: ListingService,
  trash: TrashService,
  ledger: LedgerService,
): FastifyPluginAsync {
  return async app => {
    const rateLimits = buildRateLimits(app.hearth.config);
    const writeConfig = { permission: 'write' as const, rateLimit: rateLimits.write };

    app.post<{ Body: MkdirRequest }>(
      '/fs/mkdir',
      { schema: schemas.mkdir, config: writeConfig },
      async request => {
        const parent = request.resolvePath(request.body.path, 'write');
        return { path: await fileOps.makeDirectory(parent, request.body.name) };
      },
    );

    app.post<{ Body: RenameRequest }>(
      '/fs/rename',
      { schema: schemas.rename, config: writeConfig },
      async request => {
        const target = request.resolvePath(request.body.path, 'write');
        await listing.require(target);
        const renamed = await fileOps.rename(target, request.body.name);
        // Reading positions follow a file renamed through Hearth — including
        // every file beneath a renamed folder. See ADR 0001.
        await ledger.reprefix(request.body.path, renamed);
        return { path: renamed };
      },
    );

    for (const mode of ['copy', 'move'] as const) {
      app.post<{ Body: TransferRequest }>(
        `/fs/${mode}`,
        { schema: schemas.transfer, config: writeConfig },
        async request => {
          // A move removes the source, so it needs delete permission there too.
          const sourceAction = mode === 'move' ? 'delete' : 'read';
          const sources = request.body.sources.map(source =>
            request.resolvePath(source, sourceAction),
          );
          const destination = request.resolvePath(request.body.destination, 'write');
          await listing.assertDirectory(destination);

          const results = await fileOps.transfer(sources, destination, mode);

          // Only a move relocates the original; a copy leaves it where it was,
          // and the new copy legitimately starts with no position of its own.
          if (mode === 'move') {
            for (const result of results) {
              if (result.ok && result.resultPath) {
                await ledger.reprefix(result.path, result.resultPath);
              }
            }
          }

          const body: OperationResponse = { results };
          return body;
        },
      );
    }

    app.delete<{ Body: DeleteRequest }>(
      '/fs',
      { schema: schemas.remove, config: { permission: 'delete', rateLimit: rateLimits.write } },
      async request => {
        const useTrash = trash.enabled && !request.body.permanent;
        const results = [];

        for (const relative of request.body.paths) {
          const target = request.resolvePath(relative, 'delete');
          try {
            const entry = await listing.require(target);
            if (useTrash) {
              // Positions are kept: the item can still come back from Ember,
              // and restoring to the same path should restore where you were.
              await trash.accept(target, entry.isDirectory, entry.size);
            } else {
              await fileOps.remove(target);
              await ledger.forget(relative);
            }
            results.push({ path: relative, ok: true });
          } catch (error) {
            results.push({
              path: relative,
              ok: false,
              error: error instanceof HearthError ? error.message : 'Could not delete that item',
            });
          }
        }

        const body: OperationResponse = { results };
        return body;
      },
    );
  };
}
