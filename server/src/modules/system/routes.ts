import type { FastifyPluginAsync } from 'fastify';
import type {
  HealthResponse,
  RootDescriptor,
  RootsResponse,
  SwitchRootRequest,
  VersionResponse,
} from '@hearth/shared';

import { HEARTH_VERSION } from '../../config/env.js';
import { rootAvailable } from '../../config/index.js';
import { HearthError } from '../../lib/errors.js';

const switchRootSchema = {
  body: { type: 'object', required: ['id'], properties: { id: { type: 'string', maxLength: 64 } } },
} as const;

export const systemRoutes: FastifyPluginAsync = async app => {
  const { config, runtime } = app.hearth;
  const startedAt = Date.now();

  app.get('/system/health', { config: { auth: 'public' } }, async () => {
    const body: HealthResponse = {
      status: 'ok',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    };
    return body;
  });

  app.get('/system/version', { config: { auth: 'public' } }, async () => {
    const body: VersionResponse = { name: 'hearth', version: HEARTH_VERSION };
    return body;
  });

  app.get('/system/roots', { config: { permission: 'read' } }, async () => describeRoots());

  app.post<{ Body: SwitchRootRequest }>(
    '/system/roots',
    { schema: switchRootSchema, config: { permission: 'admin' } },
    async request => {
      const target = config.storage.roots.find(root => root.id === request.body.id);
      if (!target) throw HearthError.notFound('No such root');
      if (!rootAvailable(target)) {
        throw new HearthError(
          'ROOT_UNAVAILABLE',
          `${target.label} is not available right now; is its drive connected?`,
        );
      }

      runtime.setActiveRoot(target.id);
      request.log.info({ root: target.label }, 'active root changed');
      return describeRoots();
    },
  );

  function describeRoots(): RootsResponse {
    const activeId = runtime.get('activeRootId');
    const roots: RootDescriptor[] = config.storage.roots.map(root => ({
      id: root.id,
      label: root.label,
      active: root.id === activeId,
      available: rootAvailable(root),
    }));
    return { roots };
  }
};
