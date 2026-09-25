import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../server/src/config/index.js';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

function parseEnv(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) result[match[1]!] = match[2]!.trim();
  }
  return result;
}

/** Every `envLimit('X', …)` / rate bucket in the config loader, as full variable names. */
function limitVariables(): string[] {
  const source = read('server/src/config/index.ts');
  const direct = [...source.matchAll(/envLimit(?:Renamed)?\('([A-Z0-9_]+)'/g)].map(
    match => `HEARTH_${match[1]}`,
  );
  const buckets = [...source.matchAll(/rateBucket\('([A-Z]+)'/g)].map(
    match => `HEARTH_RATE_LIMIT_${match[1]}_MAX`,
  );
  return [...direct, ...buckets];
}

const WEB_LIMITS = ['HEARTH_WEB_MAX_HIGHLIGHT_CHARS', 'HEARTH_WEB_PARALLEL_UPLOADS'];

const saved = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

describe('limit variables', () => {
  it('are all documented in .env.example', () => {
    const example = parseEnv(read('.env.example'));
    for (const name of [...limitVariables(), ...WEB_LIMITS])
      expect(example, name).toHaveProperty(name);
  });

  it('are all lifted in .env.development', () => {
    const development = parseEnv(read('.env.development'));
    for (const name of [...limitVariables(), ...WEB_LIMITS])
      expect(development[name], name).toBe('0');
  });

  it('make every cap unlimited when development values are loaded', () => {
    for (const key of Object.keys(process.env))
      if (key.startsWith('HEARTH_')) delete process.env[key];
    Object.assign(process.env, parseEnv(read('.env.development')), {
      HEARTH_ROOT_DIRECTORIES: './example',
    });
    const config = loadConfig(true);

    const caps = [
      config.server.bodyLimitBytes,
      config.auth.sessionExpiryMs,
      config.auth.mediaTokenTtlSeconds,
      ...Object.values(config.listing),
      config.upload.maxFileSizeBytes,
      config.upload.maxFilesPerRequest,
      config.upload.chunkSessionTimeoutMs,
      config.upload.zipLinkTtlMs,
      config.trash.retentionDays,
      config.trash.maxSizeBytes,
      config.search.everythingTimeoutMs,
      config.search.maxResults,
      config.search.maxQueryLength,
      config.media.thumbnailMaxWidth,
      config.media.maxTextBytes,
      config.media.maxTextSaveBytes,
      config.media.archiveMaxEntries,
      config.media.archiveMaxMemberBytes,
      config.media.folderCoverMaxDepth,
      config.media.folderCoverMaxBranches,
      ...Object.values(config.cache),
      ...Object.values(config.ledger),
      ...Object.values(config.rateLimits).map(bucket => bucket.max),
    ];
    for (const cap of caps) expect(cap).toBe(Number.POSITIVE_INFINITY);
  });

  it('keep finite defaults outside development', () => {
    for (const key of Object.keys(process.env))
      if (key.startsWith('HEARTH_')) delete process.env[key];
    process.env.HEARTH_ROOT_DIRECTORIES = './example';
    const config = loadConfig(false);
    expect(config.listing.maxEntries).toBe(20_000);
    expect(config.rateLimits.login).toEqual({ max: 10, windowMs: 5 * 60_000 });
  });

  it('rejects a negative cap', () => {
    process.env.HEARTH_ROOT_DIRECTORIES = './example';
    process.env.HEARTH_ARCHIVE_MAX_ENTRIES = '-1';
    expect(() => loadConfig()).toThrow(/zero \(unlimited\) or positive/);
  });
});
