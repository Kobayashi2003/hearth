import type { FastifyPluginAsync } from 'fastify';
import type {
  LoginRequest,
  MediaTokenRequest,
  MediaTokenResponse,
  SessionResponse,
} from '@hearth/shared';

import { buildRateLimits } from '../../plugins/rate-limit.js';
import { HearthError } from '../../lib/errors.js';
import { isoOrNull } from '../../lib/limits.js';

const loginSchema = {
  body: {
    type: 'object',
    required: ['username', 'password'],
    properties: {
      username: { type: 'string', minLength: 1, maxLength: 64 },
      password: { type: 'string', minLength: 1, maxLength: 512 },
    },
  },
} as const;

const mediaTokenSchema = {
  body: {
    type: 'object',
    required: ['path'],
    properties: { path: { type: 'string', maxLength: 4096 } },
  },
} as const;

export const wardenRoutes: FastifyPluginAsync = async app => {
  const { warden, runtime, config } = app.hearth;
  const rateLimits = buildRateLimits(config);

  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.auth.cookieSecure,
    path: '/',
    // Browsers cap cookie lifetime at about 400 days; an unlimited session asks for that.
    maxAge: Number.isFinite(config.auth.sessionExpiryMs)
      ? Math.floor(config.auth.sessionExpiryMs / 1000)
      : 400 * 24 * 3600,
  };

  app.post<{ Body: LoginRequest }>(
    '/auth/login',
    { schema: loginSchema, config: { auth: 'public', rateLimit: rateLimits.login } },
    async (request, reply) => {
      const session = await warden.login(request.body.username, request.body.password);
      reply.setCookie(warden.sessionCookieName, session.id, cookieOptions);
      const body: SessionResponse = {
        authenticated: true,
        identity: warden.identityOf(session),
        adminOnly: runtime.get('adminOnly'),
      };
      return body;
    },
  );

  app.post('/auth/logout', { config: { auth: 'public' } }, async (request, reply) => {
    const sessionId = request.cookies[warden.sessionCookieName];
    if (sessionId) await warden.logout(sessionId);
    reply.clearCookie(warden.sessionCookieName, { path: '/' });
    return { ok: true };
  });

  app.get('/auth/session', { config: { auth: 'public' } }, async request => {
    const session = await warden.resolveSession(request.cookies[warden.sessionCookieName]);
    const body: SessionResponse = {
      authenticated: session !== null,
      identity: session ? warden.identityOf(session) : null,
      adminOnly: runtime.get('adminOnly'),
    };
    return body;
  });

  // Only for a path the caller may already read, so a token never widens access.
  app.post<{ Body: MediaTokenRequest }>(
    '/media/token',
    { schema: mediaTokenSchema, config: { permission: 'read' } },
    async request => {
      const target = request.resolvePath(request.body.path, 'read');
      if (!request.session) throw HearthError.unauthorized();
      const relative = request.relativePath(target);
      const { token, expiresAt } = warden.issueMediaToken(request.session.username, relative);
      const body: MediaTokenResponse = { token, expiresAt: isoOrNull(expiresAt) };
      return body;
    },
  );
};
