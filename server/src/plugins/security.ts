import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';

/**
 * Transport-level hardening. The frontend is served as static assets by the
 * same Caddy edge, so its own CSP is set there; these headers protect the API
 * responses themselves.
 */
const securityPlugin: FastifyPluginAsync = async app => {
  const { config } = app.hearth;

  await app.register(cookie);

  await app.register(cors, {
    origin: config.server.corsOrigins as string[],
    credentials: true,
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'SAMEORIGIN');
    return payload;
  });
};

export default fp(securityPlugin, { name: 'hearth-security' });
