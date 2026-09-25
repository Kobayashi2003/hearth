import type { FastifyPluginAsync } from 'fastify';
import type { ProgressMap, ProgressPatch, ReadingSessionBody } from '@hearth/shared';

import { usernameOf } from '../../lib/request.js';
import type { LedgerService } from './ledger.service.js';

const progressValue = {
  type: 'object',
  nullable: true,
  required: ['kind', 'at', 'percent', 'savedAt'],
  properties: {
    kind: { type: 'string', enum: ['time', 'page', 'locator'] },
    at: { type: ['number', 'string'] },
    total: { type: 'number' },
    percent: { type: 'number', minimum: 0, maximum: 100 },
    savedAt: { type: 'number' },
  },
} as const;

const schemas = {
  progress: {
    body: {
      type: 'object',
      required: ['progress'],
      properties: { progress: { type: 'object', additionalProperties: progressValue } },
    },
  },
  sessionQuery: {
    querystring: {
      type: 'object',
      required: ['path'],
      properties: { path: { type: 'string', maxLength: 4096 } },
    },
  },
  sessionBody: {
    body: {
      type: 'object',
      required: ['path', 'record'],
      properties: { path: { type: 'string', maxLength: 4096 }, record: {} },
    },
  },
} as const;

export function createLedgerRoutes(ledger: LedgerService): FastifyPluginAsync {
  return async app => {
    const config = { permission: 'read' as const };

    app.get('/ledger/progress', { config }, async request => {
      const body: ProgressMap = ledger.readProgress(usernameOf(request));
      return body;
    });

    app.patch<{ Body: ProgressPatch }>(
      '/ledger/progress',
      { schema: schemas.progress, config },
      async request => {
        const body: ProgressMap = await ledger.patchProgress(
          usernameOf(request),
          request.body.progress,
        );
        return body;
      },
    );

    app.get<{ Querystring: { path: string } }>(
      '/ledger/session',
      { schema: schemas.sessionQuery, config },
      async request => ({ record: ledger.readSession(usernameOf(request), request.query.path) }),
    );

    app.put<{ Body: ReadingSessionBody }>(
      '/ledger/session',
      { schema: schemas.sessionBody, config },
      async request => {
        await ledger.saveSession(usernameOf(request), request.body.path, request.body.record);
        return { ok: true };
      },
    );

    app.delete<{ Querystring: { path: string } }>(
      '/ledger/session',
      { schema: schemas.sessionQuery, config },
      async request => {
        await ledger.removeSession(usernameOf(request), request.query.path);
        return { ok: true };
      },
    );
  };
}
