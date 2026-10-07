import type { FastifyError, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { ApiErrorBody } from '@hearth/shared';

import { HearthError, isAbortError } from '../lib/errors.js';
import { loggableUrl } from '../lib/logger.js';

/** The one place an error becomes a response; internal messages and host paths never reach a client. */
const errorsPlugin: FastifyPluginAsync = async app => {
  app.setNotFoundHandler((request, reply) => {
    const body: ApiErrorBody = { code: 'NOT_FOUND', message: 'No such endpoint' };
    void reply.status(404).send(body);
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (isAbortError(error) || reply.raw.destroyed) {
      request.log.debug({ err: error }, 'request aborted by client');
      return;
    }

    // The request's own log line reports the refusal; it needs only the reason.
    if (error instanceof HearthError) {
      const body: ApiErrorBody = { code: error.code, message: error.message };
      if (error.details !== undefined) body.details = error.details;
      request.failure = `${error.code}: ${error.message}`;
      void reply.status(error.statusCode).send(body);
      return;
    }

    const status = error.statusCode ?? 500;
    if (status < 500) {
      const body: ApiErrorBody = {
        code: error.code ?? 'BAD_REQUEST',
        message: error.message,
      };
      if (error.validation) body.details = error.validation;
      request.failure = `${body.code}: ${error.message}`;
      void reply.status(status).send(body);
      return;
    }

    request.log.error({ err: error, url: loggableUrl(request.url) }, 'unhandled error');
    const body: ApiErrorBody = { code: 'INTERNAL', message: 'Something went wrong' };
    void reply.status(500).send(body);
  });
};

export default fp(errorsPlugin, { name: 'hearth-errors' });
