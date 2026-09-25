import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { PermissionAction } from '@hearth/shared';

import { HearthError } from '../lib/errors.js';
import type { SafePath, Vault } from '../lib/vault.js';
import type { Session } from '../modules/warden/session-store.js';
import { actionsFromPermissionString } from '../modules/warden/permissions.js';
import type { Warden } from '../modules/warden/warden.js';

/** Resolves the session, enforces each route's auth mode and verb, and installs `request.resolvePath`. */
const authPlugin: FastifyPluginAsync = async app => {
  const { warden, vault, runtime } = app.hearth;

  app.decorateRequest('session', null);

  app.decorateRequest('relativePath', function (this: FastifyRequest, absolute: string): string {
    return vault.relativize(absolute);
  });

  app.decorateRequest(
    'resolvePath',
    function (
      this: FastifyRequest,
      userPath: string | undefined,
      action: PermissionAction,
    ): SafePath {
      const resolved = vault.resolve(userPath);
      const relative = vault.relativize(resolved);
      if (!this.session) throw HearthError.unauthorized();
      warden.assertCan(this.session, action, relative);
      return resolved;
    },
  );

  app.addHook('onRequest', async request => {
    const mode = request.routeOptions.config.auth ?? 'session';
    if (mode === 'public') return;

    const sessionId = request.cookies[warden.sessionCookieName];
    const session = await warden.resolveSession(sessionId);

    if (session) {
      request.session = session;
    } else if (mode === 'media-token') {
      request.session = await sessionFromMediaToken(request, app.hearth.warden, vault);
    }

    if (!request.session) throw HearthError.unauthorized();

    if (runtime.get('adminOnly') && !request.session.permissions.includes('a')) {
      throw HearthError.forbidden('The server is currently limited to administrators');
    }

    const permission = request.routeOptions.config.permission;
    if (permission && !hasGlobalVerb(request.session, permission)) {
      throw HearthError.forbidden(`You do not have ${permission} permission`);
    }
  });
};

function hasGlobalVerb(session: Session, action: PermissionAction): boolean {
  return actionsFromPermissionString(session.permissions).includes(action);
}

/** A media token is checked against the requested path and yields a read-only session. */
async function sessionFromMediaToken(
  request: FastifyRequest,
  warden: Warden,
  vault: Vault,
): Promise<Session | null> {
  const query = request.query as { token?: string; path?: string };
  if (!query.token || query.path === undefined) return null;

  let relative: string;
  try {
    relative = vault.relativize(vault.resolve(query.path));
  } catch {
    return null;
  }

  const verified = warden.verifyMediaToken(query.token, relative);
  if (!verified) return null;

  return {
    id: 'media-token',
    username: verified.username,
    permissions: 'r',
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  };
}

export default fp(authPlugin, { name: 'hearth-auth' });
