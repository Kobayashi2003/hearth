import type { FastifyPluginAsync } from 'fastify';
import type {
  DeleteRequest,
  MkdirRequest,
  OperationResponse,
  OperationResult,
  RenameRequest,
  TransferRequest,
} from '@hearth/shared';

import { HearthError } from '../../lib/errors.js';
import { maxItems } from '../../lib/limits.js';
import { buildRateLimits } from '../../plugins/rate-limit.js';
import type { TrashService } from '../ember/trash.service.js';
import type { LedgerService } from '../ledger/ledger.service.js';
import type { FileOpsService } from './fileops.service.js';
import type { ListingService } from './listing.service.js';

const pathAndName = {
  body: {
    type: 'object',
    required: ['path', 'name'],
    properties: { path: { type: 'string' }, name: { type: 'string', minLength: 1 } },
  },
} as const;

const schemasFor = (batch: number) => {
  const pathList = {
    type: 'array',
    minItems: 1,
    ...maxItems(batch),
    items: { type: 'string' },
  } as const;
  return {
    mkdir: pathAndName,
    rename: pathAndName,
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
};

export function createFileOpsRoutes(
  fileOps: FileOpsService,
  listing: ListingService,
  trash: TrashService,
  ledger: LedgerService,
): FastifyPluginAsync {
  return async app => {
    const rateLimits = buildRateLimits(app.hearth.config);
    const schemas = schemasFor(app.hearth.config.listing.maxBatchItems);
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
        await ledger.reprefix(request.relativePath(target), renamed);
        return { path: renamed };
      },
    );

    for (const mode of ['copy', 'move'] as const) {
      app.post<{ Body: TransferRequest }>(
        `/fs/${mode}`,
        { schema: schemas.transfer, config: writeConfig },
        async request => {
          // A move removes the source, so it needs delete permission there.
          const sourceAction = mode === 'move' ? 'delete' : 'read';
          const sources = request.body.sources.map(source =>
            request.resolvePath(source, sourceAction),
          );
          const destination = request.resolvePath(request.body.destination, 'write');
          await listing.assertDirectory(destination);

          const results = await fileOps.transfer(sources, destination, mode);
          if (mode === 'move') {
            for (const result of results) {
              if (result.ok && result.resultPath)
                await ledger.reprefix(result.path, result.resultPath);
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
        const results: OperationResult[] = [];

        for (const requested of request.body.paths) {
          try {
            const target = request.resolvePath(requested, 'delete');
            const relative = request.relativePath(target);
            const entry = await listing.require(target);
            if (useTrash) {
              // Progress is kept: restoring to the same path restores where you were.
              await trash.accept(target, entry.isDirectory, entry.size);
            } else {
              await fileOps.remove(target);
              await ledger.forget(relative);
            }
            results.push({ path: requested, ok: true });
          } catch (error) {
            results.push({
              path: requested,
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
