import type { FastifyPluginAsync } from 'fastify';
import type {
  CreateUserRequest,
  LockdownSettings,
  PermissionRule,
  PermissionRulesResponse,
  UpdateUserRequest,
  UsersResponse,
  ViewerSettings,
} from '@hearth/shared';

import { HearthError } from '../../lib/errors.js';
import { maxItems } from '../../lib/limits.js';
import type { Warden } from '../warden/warden.js';

const permissionActions = ['read', 'write', 'delete', 'admin'];

const schemasFor = (batch: number) =>
  ({
    createUser: {
      body: {
        type: 'object',
        required: ['username', 'password', 'permissions'],
        properties: {
          username: { type: 'string', minLength: 1, maxLength: 64 },
          password: { type: 'string', minLength: 1, maxLength: 512 },
          permissions: { type: 'string', maxLength: 8, pattern: '^[rwda]*$' },
        },
      },
    },
    updateUser: {
      body: {
        type: 'object',
        minProperties: 1,
        properties: {
          password: { type: 'string', minLength: 1, maxLength: 512 },
          permissions: { type: 'string', maxLength: 8, pattern: '^[rwda]*$' },
        },
      },
    },
    rules: {
      body: {
        type: 'object',
        required: ['rules'],
        properties: {
          rules: {
            type: 'array',
            ...maxItems(batch),
            items: {
              type: 'object',
              required: ['username', 'path', 'permissions'],
              properties: {
                username: { type: 'string', minLength: 1, maxLength: 64 },
                path: { type: 'string', maxLength: 4096 },
                permissions: {
                  type: 'array',
                  items: { type: 'string', enum: permissionActions },
                },
                effect: { type: 'string', enum: ['allow', 'deny'] },
              },
            },
          },
        },
      },
    },
    lockdown: {
      body: {
        type: 'object',
        required: ['adminOnly'],
        properties: { adminOnly: { type: 'boolean' } },
      },
    },
    viewers: {
      body: {
        type: 'object',
        minProperties: 1,
        properties: {
          htmlViewerEnabled: { type: 'boolean' },
          htmlExternalResourcesEnabled: { type: 'boolean' },
        },
      },
    },
  }) as const;

export function createAdminRoutes(warden: Warden): FastifyPluginAsync {
  return async app => {
    const { runtime, config } = app.hearth;
    const schemas = schemasFor(config.listing.maxBatchItems);
    const adminOnly = { permission: 'admin' as const };

    app.get('/admin/users', { config: adminOnly }, async () => {
      const body: UsersResponse = { users: warden.users.list() };
      return body;
    });

    app.post<{ Body: CreateUserRequest }>(
      '/admin/users',
      { schema: schemas.createUser, config: adminOnly },
      async request =>
        warden.users.create(request.body.username, request.body.password, request.body.permissions),
    );

    app.patch<{ Params: { username: string }; Body: UpdateUserRequest }>(
      '/admin/users/:username',
      { schema: schemas.updateUser, config: adminOnly },
      async request => {
        const updated = await warden.users.update(request.params.username, request.body);
        await warden.revokeSessions(request.params.username);
        return updated;
      },
    );

    app.delete<{ Params: { username: string } }>(
      '/admin/users/:username',
      { config: adminOnly },
      async request => {
        if (request.session?.username === request.params.username) {
          throw HearthError.badRequest('You cannot delete the account you are signed in with');
        }
        await warden.users.remove(request.params.username);
        await warden.revokeSessions(request.params.username);
        return { ok: true };
      },
    );

    app.get('/admin/permissions', { config: adminOnly }, async () => {
      const body: PermissionRulesResponse = { rules: warden.permissions.list() };
      return body;
    });

    app.put<{ Body: { rules: PermissionRule[] } }>(
      '/admin/permissions',
      { schema: schemas.rules, config: adminOnly },
      async request => {
        const body: PermissionRulesResponse = {
          rules: await warden.permissions.replaceAll(request.body.rules),
        };
        return body;
      },
    );

    app.get('/admin/lockdown', { config: adminOnly }, async () => {
      const body: LockdownSettings = { adminOnly: runtime.get('adminOnly') };
      return body;
    });

    app.put<{ Body: LockdownSettings }>(
      '/admin/lockdown',
      { schema: schemas.lockdown, config: adminOnly },
      async request => {
        runtime.set('adminOnly', request.body.adminOnly);
        const body: LockdownSettings = { adminOnly: runtime.get('adminOnly') };
        return body;
      },
    );

    app.get('/admin/viewers', { config: { permission: 'read' } }, async () => viewerSettings());

    app.put<{ Body: Partial<ViewerSettings> }>(
      '/admin/viewers',
      { schema: schemas.viewers, config: adminOnly },
      async request => {
        if (request.body.htmlViewerEnabled !== undefined) {
          runtime.set('htmlViewerEnabled', request.body.htmlViewerEnabled);
        }
        if (request.body.htmlExternalResourcesEnabled !== undefined) {
          runtime.set('htmlExternalResourcesEnabled', request.body.htmlExternalResourcesEnabled);
        }
        return viewerSettings();
      },
    );

    function viewerSettings(): ViewerSettings {
      return {
        htmlViewerEnabled: runtime.get('htmlViewerEnabled'),
        htmlExternalResourcesEnabled: runtime.get('htmlExternalResourcesEnabled'),
      };
    }
  };
}
