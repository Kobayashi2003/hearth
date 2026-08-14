import type { FastifyError, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { ApiErrorBody } from '@hearth/shared';

import { HearthError, isAbortError } from '../lib/errors.js';

/**
 * The one place an error becomes a response. Unknown errors are logged in full
 * and reported generically — internal messages and absolute host paths are
 * never sent to a client.
 */
const errorsPlugin: FastifyPluginAsync = async app => {
  app.setNotFoundHandler((request, reply) => {
    const body: ApiErrorBody = { code: 'NOT_FOUND', message: 'No such endpoint' };
    void reply.status(404).send(body);
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    // The client hung up; nothing to send and nothing worth logging as an error.
    if (isAbortError(error) || reply.raw.destroyed) {
      request.log.debug({ err: error }, 'request aborted by client');
      return;
    }

    if (error instanceof HearthError) {
      const body: ApiErrorBody = { code: error.code, message: error.message };
      if (error.details !== undefined) body.details = error.details;
      request.log.info({ code: error.code, msg: error.message }, 'request rejected');
      void reply.status(error.statusCode).send(body);
      return;
    }

    // Fastify's own errors (schema validation, payload limits) carry a status.
    const status = error.statusCode ?? 500;
    if (status < 500) {
      const body: ApiErrorBody = {
        code: error.code ?? 'BAD_REQUEST',
        message: error.message,
      };
      if (error.validation) body.details = error.validation;
      void reply.status(status).send(body);
      return;
    }

    request.log.error({ err: error }, 'unhandled error');
    const body: ApiErrorBody = { code: 'INTERNAL', message: 'Something went wrong' };
    void reply.status(500).send(body);
  });
};

export default fp(errorsPlugin, { name: 'hearth-errors' });
