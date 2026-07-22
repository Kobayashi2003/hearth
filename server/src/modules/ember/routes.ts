import type { FastifyPluginAsync } from 'fastify';
import type { TrashListResponse, TrashRestoreRequest, TrashSettings } from '@hearth/shared';

import { buildRateLimits } from '../../plugins/rate-limit.js';
import type { TrashService } from './trash.service.js';

const restoreSchema = {
  body: {
    type: 'object',
    required: ['ids'],
    properties: { ids: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'string' } } },
  },
} as const;

const settingsSchema = {
  body: { type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } } },
} as const;

export function createEmberRoutes(trash: TrashService): FastifyPluginAsync {
  return async app => {
    const { runtime } = app.hearth;
    const rateLimits = buildRateLimits(app.hearth.config);
    const deleteConfig = { permission: 'delete' as const, rateLimit: rateLimits.write };

    app.get('/trash', { config: { permission: 'delete' } }, async () => {
      const body: TrashListResponse = await trash.list();
      return body;
    });

    app.post<{ Body: TrashRestoreRequest }>(
      '/trash/restore',
      { schema: restoreSchema, config: { permission: 'write', rateLimit: rateLimits.write } },
      async request => {
        const results = [];
        for (const id of request.body.ids) {
          try {
            results.push({ path: id, ok: true, resultPath: await trash.restore(id) });
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

    app.get('/trash/settings', { config: { permission: 'read' } }, async () => trash.settings());

    app.put<{ Body: { enabled: boolean } }>(
      '/trash/settings',
      { schema: settingsSchema, config: { permission: 'admin' } },
      async request => {
        runtime.set('trashEnabled', request.body.enabled);
        const body: TrashSettings = trash.settings();
        return body;
      },
    );
  };
}
