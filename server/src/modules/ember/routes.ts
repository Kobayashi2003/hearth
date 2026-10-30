import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type {
  OperationResult,
  PermissionAction,
  TrashItem,
  TrashListResponse,
  TrashRestoreRequest,
  TrashSettings,
} from '@hearth/shared';

import { HearthError } from '../../lib/errors.js';
import { maxItems } from '../../lib/limits.js';
import type { PathFollower } from '../../lib/path-follower.js';
import { buildRateLimits } from '../../plugins/rate-limit.js';
import type { TrashService } from './trash.service.js';

const restoreSchema = (batch: number) =>
  ({
    body: {
      type: 'object',
      required: ['ids'],
      properties: {
        ids: { type: 'array', minItems: 1, ...maxItems(batch), items: { type: 'string' } },
      },
    },
  }) as const;

/** `followers` see a restore as a move back, so positions and favorites return with the item. */
export function createEmberRoutes(
  trash: TrashService,
  followers: PathFollower,
): FastifyPluginAsync {
  return async app => {
    const rateLimits = buildRateLimits(app.hearth.config);
    const deleteConfig = { permission: 'delete' as const, rateLimit: rateLimits.write };

    /**
     * Each item answers to the rules of the place it was deleted from, as it
     * would have there: seeing it to read, restoring it to write, purging it to
     * delete. Rules for what was inside a folder still count; it is all in the bin.
     */
    const may = (request: FastifyRequest, action: PermissionAction, item: TrashItem) => {
      try {
        app.hearth.warden.assertCanTree(request.session!, action, item.originalPath, () => true);
        return true;
      } catch {
        return false;
      }
    };
    const assertMay = (request: FastifyRequest, action: PermissionAction, item: TrashItem) => {
      if (!may(request, action, item)) {
        throw HearthError.forbidden(`You do not have ${action} permission for that item`);
      }
    };

    app.get('/trash', { config: { permission: 'delete' } }, async request => {
      const body: TrashListResponse = await trash.list(item => may(request, 'read', item));
      return body;
    });

    app.post<{ Body: TrashRestoreRequest }>(
      '/trash/restore',
      {
        schema: restoreSchema(app.hearth.config.listing.maxBatchItems),
        config: { permission: 'write', rateLimit: rateLimits.write },
      },
      async request => {
        const results: OperationResult[] = [];
        for (const id of request.body.ids) {
          try {
            assertMay(request, 'write', trash.item(id));
            const { path, originalPath } = await trash.restore(id);
            await followers.reprefix(originalPath, path);
            results.push({ path: id, ok: true, resultPath: path });
          } catch (error) {
            results.push({
              path: id,
              ok: false,
              error: error instanceof Error ? error.message : 'Could not restore that item',
            });
          }
        }
        return { results };
      },
    );

    app.delete<{ Params: { id: string } }>(
      '/trash/:id',
      { config: deleteConfig },
      async request => {
        assertMay(request, 'delete', trash.item(request.params.id));
        await trash.purge(request.params.id);
        return { ok: true };
      },
    );

    // What this user may not delete stays for someone who may.
    app.delete('/trash', { config: deleteConfig }, async request => ({
      removed: await trash.empty(item => may(request, 'delete', item)),
    }));

    /**
     * What a delete will do, for anyone who can delete; the settings themselves
     * are changed by an administrator through /admin/settings.
     */
    app.get('/trash/settings', { config: { permission: 'delete' } }, async () => {
      const body: TrashSettings = trash.settings();
      return body;
    });
  };
}
