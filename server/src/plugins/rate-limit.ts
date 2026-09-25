import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

import type { AppConfig, RateBucket } from '../config/index.js';

/**
 * A global ceiling; routes opt into tighter buckets via `config.rateLimit`. An
 * unlimited bucket is `undefined`, so its routes still fall under the global one.
 */
const rateLimitPlugin: FastifyPluginAsync = async app => {
  const { global } = app.hearth.config.rateLimits;
  await app.register(rateLimit, {
    global: Number.isFinite(global.max),
    max: Number.isFinite(global.max) ? global.max : 0,
    timeWindow: global.windowMs,
  });
};

export type RouteRateLimit = { max: number; timeWindow: number } | undefined;

function toRoute(bucket: RateBucket): RouteRateLimit {
  return Number.isFinite(bucket.max) ? { max: bucket.max, timeWindow: bucket.windowMs } : undefined;
}

export function buildRateLimits(
  config: AppConfig,
): Record<'write' | 'search' | 'login', RouteRateLimit> {
  return {
    write: toRoute(config.rateLimits.write),
    search: toRoute(config.rateLimits.search),
    login: toRoute(config.rateLimits.login),
  };
}

export default fp(rateLimitPlugin, { name: 'hearth-rate-limit' });
