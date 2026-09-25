import { buildApp } from './app.js';
import { ConfigError, consumeLegacyEnvNames, loadEnvFiles } from './config/env.js';
import { loadConfig } from './config/index.js';
import { createLogger } from './lib/logger.js';

/** `npm run dev` passes --development; it layers .env.development, which lifts every limit. */
const development =
  process.argv.includes('--development') || process.env.HEARTH_MODE === 'development';
const envFiles = loadEnvFiles(development);

async function main(): Promise<void> {
  const config = loadConfig(development);
  const logger = createLogger(config);
  logger.info(
    { mode: development ? 'development' : 'production', envFiles },
    'configuration loaded',
  );

  const legacyNames = consumeLegacyEnvNames();
  if (legacyNames.length > 0) {
    logger.warn(
      { variables: legacyNames },
      'Un-prefixed environment variables are deprecated — rename them with the HEARTH_ prefix',
    );
  }

  // Everything's HTTP server serves any indexed file without auth; off loopback it is a second door in.
  if (!isLoopbackUrl(config.search.everythingUrl)) {
    logger.warn(
      { url: config.search.everythingUrl },
      'Everything is configured on a non-loopback address — it serves file contents without authentication',
    );
  }

  const app = await buildApp({ config, logger });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.server.port, host: config.server.host });
  logger.info(
    {
      root: config.storage.roots.length,
      api: config.server.apiPrefix,
    },
    'hearth-server ready',
  );
}

function isLoopbackUrl(rawUrl: string): boolean {
  try {
    const { hostname } = new URL(rawUrl);
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
  } catch {
    return false;
  }
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    process.stderr.write(`\nHearth cannot start.\n${error.message}\n\n`);
    process.exit(1);
  }
  process.stderr.write(`\nHearth failed to start.\n${String(error)}\n\n`);
  process.exit(1);
});
