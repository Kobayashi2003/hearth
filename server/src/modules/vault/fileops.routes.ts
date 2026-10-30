import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
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
import type { PathFollower } from '../../lib/path-follower.js';
import type { SafePath } from '../../lib/vault.js';
import { buildRateLimits } from '../../plugins/rate-limit.js';
import type { TrashService } from '../ember/trash.service.js';
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

interface FileOpsServices {
  fileOps: FileOpsService;
  listing: ListingService;
  trash: TrashService;
  /** Reading positions and favorites, which follow what moved. */
  followers: PathFollower;
}

export function createFileOpsRoutes(
  fileOps: FileOpsService,
  listing: ListingService,
  trash: TrashService,
  followers: PathFollower,
): FastifyPluginAsync {
  const services: FileOpsServices = { fileOps, listing, trash, followers };
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
        // A folder's new name moves everything in it, out from under rules that name its paths.
        const target = notTheRoot(request, request.resolveTree(request.body.path, 'write'));
        await listing.require(target);
        const renamed = await fileOps.rename(target, request.body.name);
        await followers.reprefix(request.relativePath(target), renamed);
        return { path: renamed };
      },
    );

    for (const mode of ['copy', 'move'] as const) {
      app.post<{ Body: TransferRequest }>(
        `/fs/${mode}`,
        { schema: schemas.transfer, config: writeConfig },
        async request => {
          // A move removes the source, so it needs delete permission there. A copy
          // reads everything inside, and would carry it out from under its rules.
          const sourceAction = mode === 'move' ? 'delete' : 'read';
          const sources = request.body.sources.map(source =>
            notTheRoot(request, request.resolveTree(source, sourceAction)),
          );
          const destination = request.resolvePath(request.body.destination, 'write');
          await listing.assertDirectory(destination);

          const results = await fileOps.transfer(sources, destination, mode);
          if (mode === 'move') await followMoves(followers, results);
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
        // One at a time, each reporting its own outcome: one failure does not stop the rest.
        for (const requested of request.body.paths) {
          results.push(await deleteOne(services, request, requested, useTrash));
        }
        const body: OperationResponse = { results };
        return body;
      },
    );
  };
}

/**
 * The root is where Hearth is configured to look, not an item in it: renamed,
 * moved or deleted, it would leave Hearth serving a folder that is gone.
 */
function notTheRoot(request: FastifyRequest, target: SafePath): SafePath {
  if (request.relativePath(target) === '') {
    throw HearthError.badRequest('The root itself cannot be renamed, moved or deleted');
  }
  return target;
}

async function followMoves(followers: PathFollower, results: OperationResult[]) {
  for (const result of results) {
    if (result.ok && result.resultPath) await followers.reprefix(result.path, result.resultPath);
  }
}

/** One item to the recycle bin (or gone for good), reporting its own outcome. */
async function deleteOne(
  { fileOps, listing, trash, followers }: FileOpsServices,
  request: FastifyRequest,
  requested: string,
  useTrash: boolean,
): Promise<OperationResult> {
  try {
    const target = notTheRoot(request, request.resolveTree(requested, 'delete'));
    const entry = await listing.require(target);
    if (useTrash) {
      // Progress is kept: restoring to the same path restores where you were.
      await trash.accept(target, entry.isDirectory, entry.size);
    } else {
      const relative = request.relativePath(target);
      await fileOps.remove(target);
      await followers.forget(relative);
    }
    return { path: requested, ok: true };
  } catch (error) {
    const message = error instanceof HearthError ? error.message : 'Could not delete that item';
    return { path: requested, ok: false, error: message };
  }
}
