import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { PermissionAction } from '@hearth/shared';

import { HearthError } from '../lib/errors.js';
import type { SafePath, Vault } from '../lib/vault.js';
import type { Session } from '../modules/warden/session-store.js';
import type { Warden } from '../modules/warden/warden.js';

/**
 * Populates `request.session`, enforces the route's declared auth mode, and
 * installs `request.resolvePath` — the single gate through which a user path
 * becomes a filesystem path.
 */
const authPlugin: FastifyPluginAsync = async app => {
  const { warden, vault, runtime } = app.hearth;

  app.decorateRequest('session', null);

  app.decorateRequest('relativePath', function (this: FastifyRequest, absolute: string): string {
    return vault.relativize(absolute);
  });

  app.decorateRequest(
    'resolvePath',
    function (this: FastifyRequest, userPath: string | undefined, action: PermissionAction): SafePath {
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

    // Admin-only mode must take effect immediately, not at next login.
    if (runtime.get('adminOnly') && !request.session.permissions.includes('a')) {
      throw HearthError.forbidden('The server is currently limited to administrators');
    }

    const permission = request.routeOptions.config.permission;
    if (permission && !hasGlobalVerb(request.session, permission)) {
      throw HearthError.forbidden(`You do not have ${permission} permission`);
    }
  });
};

/** `w` implies `d`, matching the permission registry's own fallback. */
function hasGlobalVerb(session: Session, action: PermissionAction): boolean {
  const char = { read: 'r', write: 'w', delete: 'd', admin: 'a' }[action];
  if (session.permissions.includes(char)) return true;
  return action === 'delete' && session.permissions.includes('w');
}

/**
 * A media token authorises exactly one path, so it is validated against the
 * path this request is actually asking for. The synthesised session is
 * read-only regardless of what the real account may do.
 */
async function sessionFromMediaToken(
  request: FastifyRequest,
  warden: Warden,
  vault: Vault,
): Promise<Session | null> {
  const query = request.query as { token?: string; path?: string };
  if (!query.token || query.path === undefined) return null;

  // Normalise through the vault so a token issued for "a/b" also matches "a//b".
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
