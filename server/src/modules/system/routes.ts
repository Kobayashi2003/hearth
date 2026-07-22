import type { FastifyPluginAsync } from 'fastify';
import type { HealthResponse, RootDescriptor, RootsResponse, VersionResponse } from '@hearth/shared';

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
    const body: VersionResponse = { name: 'hearth', version: '1.0.0' };
    return body;
  });

  app.get('/system/roots', { config: { permission: 'read' } }, async () => {
    const activeId = runtime.get('activeRootId');
    const roots: RootDescriptor[] = config.storage.roots.map(root => ({
      id: root.id,
      label: root.label,
      active: root.id === activeId,
    }));
    const body: RootsResponse = { roots };
    return body;
  });
};
