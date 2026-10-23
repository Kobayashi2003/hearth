import type { FastifyPluginAsync } from 'fastify';
import { MAX_FAVORITES, type HobDocument, type HobPatch } from '@hearth/shared';

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
      naturalSort: { type: 'boolean' },
      favorites: {
        type: 'array',
        maxItems: MAX_FAVORITES,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['root', 'path'],
          properties: {
            root: { type: 'string', minLength: 1, maxLength: 64 },
            path: { type: 'string', maxLength: 4096 },
            label: { type: 'string', minLength: 1, maxLength: 200 },
          },
        },
      },
      // An id from the reader's theme registry; unknown ones fall back to its default.
      readerTheme: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' },
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
