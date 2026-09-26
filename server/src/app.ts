import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import Fastify, { LogController } from 'fastify';
import fp from 'fastify-plugin';
import multipart from '@fastify/multipart';
import type { Logger } from 'pino';

import './context.js';
import type { AppConfig } from './config/index.js';
import { RuntimeState } from './config/runtime-state.js';
import { bodyLimit } from './lib/limits.js';
import { Vault } from './lib/vault.js';
import authPlugin from './plugins/auth.js';
import errorsPlugin from './plugins/errors.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import securityPlugin from './plugins/security.js';
import { Beacon } from './modules/beacon/beacon.js';
import { createBeaconRoutes } from './modules/beacon/routes.js';
import { TrashService } from './modules/ember/trash.service.js';
import { createEmberRoutes } from './modules/ember/routes.js';
import { LedgerService } from './modules/ledger/ledger.service.js';
import { createLedgerRoutes } from './modules/ledger/routes.js';
import { HobService } from './modules/hob/hob.service.js';
import { createHobRoutes } from './modules/hob/routes.js';
import { ChunkedUploadService } from './modules/vault/chunked-upload.service.js';
import { DownloadService } from './modules/vault/download.service.js';
import { FileOpsService } from './modules/vault/fileops.service.js';
import { createFileOpsRoutes } from './modules/vault/fileops.routes.js';
import { ListingService } from './modules/vault/listing.service.js';
import { createVaultRoutes } from './modules/vault/routes.js';
import { createTransferRoutes } from './modules/vault/transfer.routes.js';
import { UploadService } from './modules/vault/upload.service.js';
import { FfmpegAdapter } from './adapters/ffmpeg/ffmpeg.js';
import { BackgroundService } from './modules/kiln/background.service.js';
import { ArchiveService } from './modules/kiln/archive.service.js';
import { ComicService } from './modules/kiln/comic.service.js';
import { DocumentService } from './modules/kiln/document.service.js';
import { StreamService } from './modules/kiln/stream.service.js';
import { TextService } from './modules/kiln/text.service.js';
import { SubtitleService } from './modules/kiln/subtitle.service.js';
import { ThumbnailService } from './modules/kiln/thumbnail.service.js';
import { FolderCoverService } from './modules/kiln/folder-cover.service.js';
import { createKilnRoutes } from './modules/kiln/routes.js';
import { CacheCleanupService } from './modules/system/cache-cleanup.service.js';
import { wardenRoutes } from './modules/warden/routes.js';
import { createSessionStore } from './modules/warden/session-store.js';
import { Warden } from './modules/warden/warden.js';
import { systemRoutes } from './modules/system/routes.js';
import { createAdminRoutes } from './modules/system/admin.routes.js';

export interface BuildOptions {
  config: AppConfig;
  logger: Logger;
}

/** Separate from `main.ts` so tests can build an instance without binding a port. */
export type HearthApp = Awaited<ReturnType<typeof buildApp>>;

export async function buildApp({ config, logger }: BuildOptions) {
  ensureDirectories(config);

  const app = Fastify({
    loggerInstance: logger,
    logController: new LogController({ disableRequestLogging: true }),
    ajv: { customOptions: { allowUnionTypes: true } },
    genReqId: () => crypto.randomUUID(),
    bodyLimit: bodyLimit(config.server.bodyLimitBytes),
    trustProxy: true,
  });

  const runtime = new RuntimeState(config);
  runtime.onPersistError = error =>
    logger.warn({ err: error }, 'could not persist runtime settings — they apply until restart');
  const vault = new Vault(runtime);
  const sessions = await createSessionStore(
    config.auth.redisUrl,
    config.auth.sessionExpiryMs,
    reason => logger.warn({ reason }, 'Redis unavailable — falling back to in-memory sessions'),
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
  const ledger = new LedgerService(
    path.join(config.storage.dataDirectory, 'ledger'),
    config.ledger,
  );
  await ledger.migrate();
  const hob = new HobService(path.join(config.storage.dataDirectory, 'preferences'));
  const beacon = new Beacon(config, runtime, vault, logger);
  const fileOps = new FileOpsService(vault);
  const trash = new TrashService(config, runtime, vault, logger);
  const uploads = new UploadService(config, vault);
  const chunked = new ChunkedUploadService(config, vault, uploads, logger);
  const downloads = new DownloadService(vault, config.upload.zipLinkTtlMs);

  const ffmpeg = new FfmpegAdapter({
    ffmpegPath: config.media.ffmpegPath,
    ffprobePath: config.media.ffprobePath,
    crf: config.media.transcodeCrf,
    preset: config.media.transcodePreset,
  });
  const kiln = {
    listing,
    streams,
    ffmpeg,
    text: new TextService(config),
    thumbnails: new ThumbnailService(config, ffmpeg),
    subtitles: new SubtitleService(config, ffmpeg),
    folderCovers: new FolderCoverService(config),
    comics: new ComicService(config),
    archives: new ArchiveService(config),
    documents: new DocumentService(runtime),
    backgrounds: new BackgroundService(config),
  };
  const caches = new CacheCleanupService(config, logger);

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
      await api.register(createAdminRoutes(warden));
      await api.register(createVaultRoutes(listing));
      await api.register(createFileOpsRoutes(fileOps, listing, trash, ledger));
      await api.register(createTransferRoutes(uploads, chunked, downloads, listing, streams));
      await api.register(createEmberRoutes(trash, ledger));
      await api.register(createLedgerRoutes(ledger));
      await api.register(createHobRoutes(hob));
      await api.register(createBeaconRoutes(beacon));
      await api.register(createKilnRoutes(kiln));
    },
    { prefix: config.server.apiPrefix },
  );

  trash.startAutoCleanup();
  chunked.startSweeper();
  caches.start();

  app.addHook('onClose', async () => {
    trash.stopAutoCleanup();
    chunked.stopSweeper();
    caches.stop();
    await warden.close();
  });

  return app;
}

/** One log line per completed request. */
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
