import type { FastifyRequest } from 'fastify';

import { HearthError } from './errors.js';

/** Aborts when the client goes away, so the work it started stops too. */
export function abortSignalOf(request: FastifyRequest): AbortSignal {
  const controller = new AbortController();
  request.raw.on('close', () => {
    if (!request.raw.readableEnded) controller.abort();
  });
  return controller.signal;
}

export function usernameOf(request: FastifyRequest): string {
  if (!request.session) throw HearthError.unauthorized();
  return request.session.username;
}
