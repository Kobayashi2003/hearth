import fs from 'node:fs';
import path from 'node:path';

import pino, { type Logger } from 'pino';

import type { AppConfig } from '../config/index.js';

/** Console plus a daily-rotated JSON log file. */
export function createLogger(config: AppConfig): Logger {
  const targets: pino.TransportTargetOptions[] = [
    { target: 'pino/file', level: config.logging.level, options: { destination: 1 } },
  ];

  if (config.logging.toFile) {
    fs.mkdirSync(config.logging.directory, { recursive: true });
    targets.push({
      target: 'pino-roll',
      level: config.logging.level,
      options: {
        file: path.join(config.logging.directory, 'hearth'),
        frequency: 'daily',
        extension: '.log',
        mkdir: true,
        limit: { count: 14 },
      },
    });
  }

  return pino(
    {
      name: 'hearth-server',
      level: config.logging.level,
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.token'],
        censor: '[redacted]',
      },
    },
    pino.transport({ targets }),
  );
}
