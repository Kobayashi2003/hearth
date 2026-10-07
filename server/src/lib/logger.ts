import fs from 'node:fs';
import path from 'node:path';

import pino, { type Logger } from 'pino';

import type { AppConfig } from '../config/index.js';

/**
 * Console and file, each in the form its reader wants: the console a line a
 * person can scan (or JSON, for a log collector), the file one JSON object per
 * line, rotated daily and kept for two weeks.
 */
export function createLogger(config: AppConfig): Logger {
  const { level, format, toFile, directory } = config.logging;
  const streams: pino.StreamEntry[] = [
    {
      level: level as pino.Level,
      stream: format === 'json' ? process.stdout : prettyStream(process.stdout.isTTY === true),
    },
  ];

  if (toFile) {
    fs.mkdirSync(directory, { recursive: true });
    streams.push({
      level: level as pino.Level,
      stream: pino.transport({
        target: 'pino-roll',
        options: {
          file: path.join(directory, 'hearth'),
          frequency: 'daily',
          dateFormat: 'yyyy-MM-dd',
          extension: '.log',
          mkdir: true,
          limit: { count: 14 },
        },
      }),
    });
  }

  return pino(
    {
      name: 'hearth',
      level,
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.token'],
        censor: '[redacted]',
      },
    },
    pino.multistream(streams),
  );
}

/** A tokens-free, readable form of a request URL, for logs. */
export function loggableUrl(url: string): string {
  const [pathname = '', query] = url.split('?', 2);
  // A site token is the path segment after /site/; it is a credential.
  const shownPath = decode(pathname.replace(/\/site\/[^/]+/, '/site/[token]'));
  if (!query) return shownPath;
  // By hand: URLSearchParams would turn a malformed escape into U+FFFD.
  const shownQuery = query
    .split('&')
    .map(pair => (pair.startsWith('token=') ? 'token=[redacted]' : decode(pair)))
    .join('&');
  return `${shownPath}?${shownQuery}`;
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
  }
}

const LEVELS: Record<number, [string, string]> = {
  10: ['TRACE', '\x1b[90m'],
  20: ['DEBUG', '\x1b[90m'],
  30: ['INFO ', '\x1b[36m'],
  40: ['WARN ', '\x1b[33m'],
  50: ['ERROR', '\x1b[31m'],
  60: ['FATAL', '\x1b[41m'],
};
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/** Fields every line has, or that the line's own layout already shows. */
const SHOWN = new Set(['level', 'time', 'pid', 'hostname', 'name', 'msg', 'module', 'reqId']);

/** One line per record: time, level, module, message, then the remaining fields. */
export function prettyLine(record: Record<string, unknown>, colour: boolean): string {
  const paint = (code: string, text: string) => (colour ? `${code}${text}${RESET}` : text);
  const [label, tint] = LEVELS[record.level as number] ?? ['?    ', ''];
  const time = new Date(record.time as number).toTimeString().slice(0, 8);
  const module = typeof record.module === 'string' ? paint(DIM, `[${record.module}] `) : '';
  const fields = Object.entries(record)
    .filter(([key]) => !SHOWN.has(key) && key !== 'err')
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`);
  const head = `${paint(DIM, time)} ${paint(tint, label)} ${module}${String(record.msg ?? '')}`;
  const line = fields.length > 0 ? `${head} ${paint(DIM, fields.join(' '))}` : head;
  const error = record.err as { stack?: string; message?: string } | undefined;
  return error ? `${line}\n  ${error.stack ?? error.message ?? JSON.stringify(error)}` : line;
}

function prettyStream(colour: boolean): pino.DestinationStream {
  return {
    write(chunk: string) {
      for (const text of chunk.split('\n')) {
        if (!text) continue;
        try {
          process.stdout.write(
            `${prettyLine(JSON.parse(text) as Record<string, unknown>, colour)}\n`,
          );
        } catch {
          process.stdout.write(`${text}\n`);
        }
      }
    },
  };
}
