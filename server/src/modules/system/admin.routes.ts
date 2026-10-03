import type { FastifyPluginAsync } from 'fastify';
import type {
  AdminSettingsPatch,
  AdminSettingsResponse,
  CreateUserRequest,
  PermissionRule,
  PermissionRulesResponse,
  SettingKey,
  UpdateUserRequest,
  UsersResponse,
} from '@hearth/shared';

import { parseSetting, SETTING_KEYS } from '../../config/settings.js';
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
    settings: {
      body: {
        type: 'object',
        minProperties: 1,
        additionalProperties: false,
        properties: Object.fromEntries(
          SETTING_KEYS.map(key => [key, { type: ['boolean', 'number', 'null'] }]),
        ),
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

    /** Every setting an administrator can change, with its .env default. */
    app.get('/admin/settings', { config: adminOnly }, async () => {
      const body: AdminSettingsResponse = { settings: runtime.describe() };
      return body;
    });

    /** Several at once; a value of null puts the setting back to its .env default. */
    app.patch<{ Body: AdminSettingsPatch }>(
      '/admin/settings',
      { schema: schemas.settings, config: adminOnly },
      async request => {
        const entries = Object.entries(request.body) as Array<
          [SettingKey, boolean | number | null]
        >;
        // All or nothing: check every value before applying any.
        for (const [key, value] of entries) {
          const parsed = value === null ? null : parseSetting(key, value);
          if (typeof parsed === 'string') throw HearthError.badRequest(parsed);
        }
        for (const [key, value] of entries) runtime.set(key, value);
        request.log.info({ settings: request.body }, 'settings changed');
        const body: AdminSettingsResponse = { settings: runtime.describe() };
        return body;
      },
    );
  };
}
