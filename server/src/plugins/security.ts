import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';

/** Headers for API responses; the SPA's own headers are set by Caddy. */
const securityPlugin: FastifyPluginAsync = async app => {
  const { config } = app.hearth;

  await app.register(cookie);

  await app.register(cors, {
    origin: config.server.corsOrigins as string[],
    credentials: true,
  });

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    if (!request.routeOptions.config.framable) reply.header('X-Frame-Options', 'SAMEORIGIN');
    return payload;
  });
};

export default fp(securityPlugin, { name: 'hearth-security' });
