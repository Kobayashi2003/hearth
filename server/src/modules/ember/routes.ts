import type { FastifyPluginAsync } from 'fastify';
import type {
  OperationResult,
  TrashListResponse,
  TrashRestoreRequest,
  TrashSettings,
} from '@hearth/shared';

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

    app.get('/trash', { config: { permission: 'delete' } }, async () => {
      const body: TrashListResponse = await trash.list();
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
        await trash.purge(request.params.id);
        return { ok: true };
      },
    );

    app.delete('/trash', { config: deleteConfig }, async () => ({ removed: await trash.empty() }));

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
