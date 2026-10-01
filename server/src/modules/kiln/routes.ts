import type { FastifyPluginAsync } from 'fastify';

import { createDocumentRoutes, type DocumentRouteServices } from './document.routes.js';
import { createMediaRoutes, type MediaRouteServices } from './media.routes.js';

export type KilnServices = MediaRouteServices & DocumentRouteServices;

/**
 * Kiln turns files into something a browser can show: media bytes, and
 * documents to render. Both halves run on this same instance, so their routes
 * keep the hooks and decorators of the scope Kiln is registered in.
 */
export function createKilnRoutes(services: KilnServices): FastifyPluginAsync {
  return async (app, options) => {
    await createMediaRoutes(services)(app, options);
    await createDocumentRoutes(services)(app, options);
  };
}
