import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Typed environment readers. Every variable is namespaced `HEARTH_*`; the
 * un-prefixed name from SimpleFileServer is still accepted so an existing .env
 * keeps working, and is reported once at startup so it can be migrated.
 */

const ENV_PREFIX = 'HEARTH_';

/** Repository root — env paths are resolved against it, not the cwd. */
export const projectRoot = path.resolve(fileURLToPath(import.meta.url), '../../../..');

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

/** Un-prefixed variables that were read, so startup can warn about them once. */
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

/** Resolve a possibly-relative path against the repository root. */
export function envPath(name: string, fallback: string): string {
  const raw = readRaw(name) ?? fallback;
  return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(projectRoot, raw);
}

/** Split a comma-separated variable, trimming and dropping empties. */
export function envList(name: string, fallback: string[] = []): string[] {
  const raw = readRaw(name);
  if (raw === undefined) return fallback;
  return raw
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
}
