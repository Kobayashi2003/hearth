import type { FastifyPluginAsync } from 'fastify';
import type { HobDocument, HobPatch } from '@hearth/shared';

import { usernameOf } from '../../lib/request.js';
import type { HobService } from './hob.service.js';

const patchSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      theme: { type: 'string', enum: ['light', 'dark', 'system'] },
      density: { type: 'string', enum: ['comfortable', 'compact'] },
      viewMode: { type: 'string', enum: ['list', 'grid'] },
      wallpaper: { type: 'string', nullable: true },
      wallpaperOpacity: { type: 'number', minimum: 0, maximum: 1 },
      gridSize: { type: 'number', minimum: 96, maximum: 320 },
      folderCovers: { type: 'boolean' },
    },
  },
} as const;

export function createHobRoutes(hob: HobService): FastifyPluginAsync {
  return async app => {
    const config = { permission: 'read' as const };

    app.get('/preferences', { config }, async request => {
      const body: HobDocument = hob.read(usernameOf(request));
      return body;
    });

    app.patch<{ Body: HobPatch }>(
      '/preferences',
      { schema: patchSchema, config },
      async request => {
        const body: HobDocument = await hob.patch(usernameOf(request), request.body);
        return body;
      },
    );
  };
}
