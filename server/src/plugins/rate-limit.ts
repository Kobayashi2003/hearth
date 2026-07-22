import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

import type { AppConfig } from '../config/index.js';

/**
 * A global ceiling plus tighter per-class limits. Routes opt into a stricter
 * bucket with `...rateLimits.write` in their options, so the limit lives next
 * to the route it protects.
 */
const rateLimitPlugin: FastifyPluginAsync = async app => {
  const { limits } = app.hearth.config;

  await app.register(rateLimit, {
    global: true,
    max: limits.globalMax,
    timeWindow: limits.globalWindowMs,
    // Streaming and download routes issue many requests per view; the tighter
    // buckets below are what actually protect expensive work.
    allowList: () => false,
  });
};

export interface RateLimitBucket {
  max: number;
  timeWindow: number;
}

/**
 * Named buckets a route spreads into its own config, e.g.
 * `config: { permission: 'write', rateLimit: rateLimits.write }`.
 */
export function buildRateLimits(config: AppConfig): Record<'write' | 'search' | 'login', RateLimitBucket> {
  return {
    write: { max: config.limits.writeMax, timeWindow: config.limits.writeWindowMs },
    search: { max: config.limits.searchMax, timeWindow: config.limits.searchWindowMs },
    login: { max: config.limits.loginMax, timeWindow: config.limits.loginWindowMs },
  };
}

export default fp(rateLimitPlugin, { name: 'hearth-rate-limit' });
