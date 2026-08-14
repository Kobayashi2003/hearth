import type { FastifyPluginAsync } from 'fastify';
import type { LedgerDocument, LedgerPatch } from '@hearth/shared';

import { HearthError } from '../../lib/errors.js';
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

const patchSchema = {
  body: {
    type: 'object',
    properties: {
      progress: { type: 'object', additionalProperties: progressValue },
      opened: { type: 'string' },
      pin: {
        type: 'object',
        required: ['path', 'value'],
        properties: { path: { type: 'string' }, value: { type: 'boolean' } },
      },
    },
  },
} as const;

export function createLedgerRoutes(ledger: LedgerService): FastifyPluginAsync {
  return async app => {
    /** Every route here is scoped to the caller — a session is always required. */
    const requireUser = (username: string | undefined): string => {
      if (!username) throw HearthError.unauthorized('Sign in to use your reading history');
      return username;
    };

    app.get('/ledger', { config: { permission: 'read' } }, async request => {
      const body: LedgerDocument = ledger.read(requireUser(request.session?.username));
      return body;
    });

    app.patch<{ Body: LedgerPatch }>(
      '/ledger',
      { schema: patchSchema, config: { permission: 'read' } },
      async request => {
        const body: LedgerDocument = await ledger.patch(
          requireUser(request.session?.username),
          request.body,
        );
        return body;
      },
    );
  };
}
