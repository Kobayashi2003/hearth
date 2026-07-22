import crypto from 'node:crypto';
import fs from 'node:fs';

import Fastify from 'fastify';
import fp from 'fastify-plugin';
import multipart from '@fastify/multipart';
import type { Logger } from 'pino';

import './context.js';
import type { AppConfig } from './config/index.js';
import { RuntimeState } from './config/runtime-state.js';
import { Vault } from './lib/vault.js';
import authPlugin from './plugins/auth.js';
import errorsPlugin from './plugins/errors.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import securityPlugin from './plugins/security.js';
import { Beacon } from './modules/beacon/beacon.js';
import { createBeaconRoutes } from './modules/beacon/routes.js';
import { TrashService } from './modules/ember/trash.service.js';
import { createEmberRoutes } from './modules/ember/routes.js';
import { ChunkedUploadService } from './modules/vault/chunked-upload.service.js';
import { DownloadService } from './modules/vault/download.service.js';
import { FileOpsService } from './modules/vault/fileops.service.js';
import { createFileOpsRoutes } from './modules/vault/fileops.routes.js';
import { ListingService } from './modules/vault/listing.service.js';
import { createVaultRoutes } from './modules/vault/routes.js';
import { createTransferRoutes } from './modules/vault/transfer.routes.js';
import { UploadService } from './modules/vault/upload.service.js';
import { StreamService } from './modules/kiln/stream.service.js';
import { createKilnRoutes } from './modules/kiln/routes.js';
import { wardenRoutes } from './modules/warden/routes.js';
import { createSessionStore } from './modules/warden/session-store.js';
import { Warden } from './modules/warden/warden.js';
import { systemRoutes } from './modules/system/routes.js';

export interface BuildOptions {
  config: AppConfig;
  logger: Logger;
}

/**
 * Assemble the server. Kept separate from `main.ts` so tests can build an
 * instance without binding a port.
 */
export type HearthApp = Awaited<ReturnType<typeof buildApp>>;

export async function buildApp({ config, logger }: BuildOptions) {
  ensureDirectories(config);

  const app = Fastify({
    loggerInstance: logger,
    disableRequestLogging: true,
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: true,
  });

  const runtime = new RuntimeState(config);
  const vault = new Vault(runtime);
  const sessions = await createSessionStore(config.auth.redisUrl, config.auth.sessionExpiryMs, reason =>
    logger.warn({ reason }, 'Redis unavailable — falling back to in-memory sessions'),
  );
  const warden = new Warden(config, runtime, sessions);

  app.decorate('hearth', { config, runtime, vault, warden });

  await app.register(errorsPlugin);
  await app.register(securityPlugin);
  await app.register(rateLimitPlugin);
  await app.register(authPlugin);
  await app.register(requestLogging);

  const listing = new ListingService(vault);
  const streams = new StreamService(config);
  const beacon = new Beacon(config, runtime, vault, logger);
  const fileOps = new FileOpsService(vault);
  const trash = new TrashService(config, runtime, vault, logger);
  const uploads = new UploadService(config, vault);
  const chunked = new ChunkedUploadService(config, vault, uploads, logger);
  const downloads = new DownloadService(vault);

  await app.register(multipart, {
    limits: {
      fileSize: Number.isFinite(config.upload.maxFileSizeBytes)
        ? config.upload.maxFileSizeBytes
        : Infinity,
    },
  });

  await app.register(
    async api => {
      await api.register(wardenRoutes);
      await api.register(systemRoutes);
      await api.register(createVaultRoutes(listing));
      await api.register(createFileOpsRoutes(fileOps, listing, trash));
      await api.register(createTransferRoutes(uploads, chunked, downloads, listing, streams));
      await api.register(createEmberRoutes(trash));
      await api.register(createBeaconRoutes(beacon));
      await api.register(createKilnRoutes(listing, streams));
    },
    { prefix: config.server.apiPrefix },
  );

  trash.startAutoCleanup();
  chunked.startSweeper();

  app.addHook('onClose', async () => {
    trash.stopAutoCleanup();
    chunked.stopSweeper();
    await warden.close();
  });

  return app;
}

/**
 * One log line per completed request. Media streams are logged at completion
 * with their byte count rather than per range, so a video does not drown the log.
 */
const requestLogging = fp(async app => {
  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        url: request.url,
        status: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
        user: request.session?.username,
      },
      'request',
    );
  });
});

function ensureDirectories(config: AppConfig): void {
  for (const directory of [
    config.storage.dataDirectory,
    config.storage.tempDirectory,
    config.upload.chunkDirectory,
    config.media.thumbnailCacheDirectory,
    config.media.comicCacheDirectory,
    config.media.psdCacheDirectory,
  ]) {
    fs.mkdirSync(directory, { recursive: true });
  }
}
