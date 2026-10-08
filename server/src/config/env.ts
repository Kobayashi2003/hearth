import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

/**
 * Typed `HEARTH_*` environment readers. The un-prefixed legacy name is still
 * accepted and reported once at startup.
 */

const ENV_PREFIX = 'HEARTH_';

/** Relative env paths resolve against the repository root, not the cwd. */
export const projectRoot = path.resolve(fileURLToPath(import.meta.url), '../../../..');

/**
 * Precedence, highest first: the process environment, then `.env.development`
 * (development only — it lifts every limit), then `.env`. dotenv never
 * overwrites a variable that is already set, so loading in this order is enough.
 */
export function loadEnvFiles(development: boolean): string[] {
  const loaded: string[] = [];
  for (const name of development ? ['.env.development', '.env'] : ['.env']) {
    const file = path.join(projectRoot, name);
    if (!fs.existsSync(file)) continue;
    dotenv.config({ path: file, quiet: true });
    loaded.push(name);
  }
  return loaded;
}

export const HEARTH_VERSION = (
  JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as { version: string }
).version;

const legacyNamesSeen = new Set<string>();

function readRaw(name: string): string | undefined {
  const prefixed = process.env[ENV_PREFIX + name];
  if (prefixed !== undefined && prefixed !== '') return prefixed;

  const legacy = process.env[name];
  if (legacy !== undefined && legacy !== '') {
    legacyNamesSeen.add(name);
    return legacy;
  }
  return undefined;
}

export function consumeLegacyEnvNames(): string[] {
  return [...legacyNamesSeen].sort();
}

export class ConfigError extends Error {
  constructor(name: string, reason: string) {
    super(`Invalid configuration for ${ENV_PREFIX}${name}: ${reason}`);
    this.name = 'ConfigError';
  }
}

export function envString(name: string, fallback: string): string {
  return readRaw(name) ?? fallback;
}

export function envOptional(name: string): string | undefined {
  return readRaw(name);
}

export function envInt(name: string, fallback: number): number {
  const raw = readRaw(name);
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) throw new ConfigError(name, `expected an integer, got "${raw}"`);
  return value;
}

/**
 * A cap. `0` means unlimited and is returned as `Infinity`, so callers compare
 * against it without a special case. `scale` converts the configured unit
 * (MB, minutes…) into the one the code uses.
 */
export function envLimit(name: string, fallback: number, scale = 1): number {
  const value = envInt(name, fallback);
  if (value < 0) throw new ConfigError(name, 'must be zero (unlimited) or positive');
  return value === 0 ? Number.POSITIVE_INFINITY : value * scale;
}

/**
 * A safeguard rather than a cap on what people can do: a positive number with
 * no "unlimited", because lifting it only lets the server wait or scan forever.
 * It stays in force under `pnpm dev` too.
 */
export function envPositive(name: string, fallback: number): number {
  const value = envInt(name, fallback);
  if (value <= 0) throw new ConfigError(name, 'must be a positive integer');
  return value;
}

/** Like `envLimit`, for a variable that was renamed. */
export function envLimitRenamed(
  name: string,
  oldName: string,
  fallback: number,
  scale = 1,
): number {
  return readRaw(name) !== undefined || readRaw(oldName) === undefined
    ? envLimit(name, fallback, scale)
    : envLimit(oldName, fallback, scale);
}

export function envBool(name: string, fallback: boolean): boolean {
  const raw = readRaw(name)?.toLowerCase();
  if (raw === undefined) return fallback;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  throw new ConfigError(name, `expected a boolean, got "${raw}"`);
}

export function envEnum<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const raw = readRaw(name);
  if (raw === undefined) return fallback;
  if (!allowed.includes(raw as T)) {
    throw new ConfigError(name, `expected one of ${allowed.join(' | ')}, got "${raw}"`);
  }
  return raw as T;
}

export function envPath(name: string, fallback: string): string {
  const raw = readRaw(name) ?? fallback;
  return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(projectRoot, raw);
}

export function envList(name: string, fallback: string[] = []): string[] {
  const raw = readRaw(name);
  if (raw === undefined) return fallback;
  return raw
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
}
