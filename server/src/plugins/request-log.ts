import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { loggableUrl } from '../lib/logger.js';

/**
 * Routes a browser calls by the hundred just by showing a folder: thumbnails,
 * covers, file bytes. Answered, they are debug detail; at info they would bury
 * everything else.
 */
const BULK = /\/(thumbnail|media\/(raw|probe|subtitle)|comic\/|archive\/entry|site\/|background)\b/;

/**
 * One line per request, at a level that says whether anyone needs to look:
 * error for a server fault, warn for a refusal, info for changes and ordinary
 * reads, debug for the bulk reads above and for requests the browser
 * abandoned (a thumbnail scrolled away, a preview closed).
 */
const requestLog: FastifyPluginAsync = async app => {
  app.addHook('onResponse', async (request, reply) => {
    const status = reply.statusCode;
    const fields = describe(request, reply);
    // A refusal Hearth chose (a 503 for a disconnected drive among them) is not a fault.
    if (status >= 500 && !request.failure) request.log.error(fields, 'request failed');
    else if (status >= 400 && status !== 401 && status !== 416) {
      request.log.warn(fields, 'request refused');
    } else if (status >= 400 || isBulk(request)) request.log.debug(fields, 'request');
    else request.log.info(fields, 'request');
  });

  app.addHook('onRequestAbort', async request => {
    request.log.debug(
      { method: request.method, url: loggableUrl(request.url) },
      'request abandoned by the browser',
    );
  });
};

function isBulk(request: FastifyRequest): boolean {
  return request.method === 'GET' && BULK.test(request.url.split('?', 1)[0]!);
}

function describe(request: FastifyRequest, reply: FastifyReply): Record<string, unknown> {
  return {
    method: request.method,
    url: loggableUrl(request.url),
    status: reply.statusCode,
    ms: Math.round(reply.elapsedTime),
    user: request.session?.username,
    ...(request.failure ? { reason: request.failure } : {}),
  };
}

export default fp(requestLog, { name: 'hearth-request-log' });
