import type { FastifyPluginAsync } from 'fastify';
import type { HobDocument, HobPatch } from '@hearth/shared';

import { HearthError } from '../../lib/errors.js';
import type { HobService } from './hob.service.js';

const patchSchema = {
  body: {
    type: 'object',
    properties: {
      theme: { type: 'string', enum: ['light', 'dark', 'system'] },
      density: { type: 'string', enum: ['comfortable', 'compact'] },
      viewMode: { type: 'string', enum: ['list', 'grid'] },
      wallpaper: { type: 'string', nullable: true },
      wallpaperOpacity: { type: 'number', minimum: 0, maximum: 1 },
      gridSize: { type: 'number', minimum: 80, maximum: 400 },
      folderCovers: { type: 'boolean' },
      showShelves: { type: 'boolean' },
      previewFullscreen: { type: 'string', enum: ['auto', 'browser', 'window'] },
    },
  },
} as const;

export function createHobRoutes(hob: HobService): FastifyPluginAsync {
  return async app => {
    const requireUser = (username: string | undefined): string => {
      if (!username) throw HearthError.unauthorized('Sign in to load your preferences');
      return username;
    };

    app.get('/preferences', { config: { permission: 'read' } }, async request => {
      const body: HobDocument = hob.read(requireUser(request.session?.username));
      return body;
    });

    app.patch<{ Body: HobPatch }>(
      '/preferences',
      { schema: patchSchema, config: { permission: 'read' } },
      async request => {
        const body: HobDocument = await hob.patch(
          requireUser(request.session?.username),
          request.body,
        );
        return body;
      },
    );
  };
}
