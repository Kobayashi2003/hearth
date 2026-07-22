import fs from 'node:fs';
import path from 'node:path';

import { HearthError } from './errors.js';
import type { RuntimeState } from '../config/runtime-state.js';

/**
 * A path that has been proven to live inside the active root. Only `Vault` can
 * mint one, so any function that takes a `SafePath` cannot be handed raw user
 * input by accident — traversal becomes a type error rather than a review item.
 */
declare const safePathBrand: unique symbol;
export type SafePath = string & { readonly [safePathBrand]: true };

/** Windows compares paths case-insensitively; POSIX does not. */
const CASE_INSENSITIVE = process.platform === 'win32';

function containedIn(candidate: string, root: string): boolean {
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (CASE_INSENSITIVE) {
    const lower = candidate.toLowerCase();
    return lower === root.toLowerCase() || lower.startsWith(prefix.toLowerCase());
  }
  return candidate === root || candidate.startsWith(prefix);
}

/** Reserved on Windows regardless of extension. */
const RESERVED_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

/** Characters Windows forbids in a path segment, plus all control characters. */
const FORBIDDEN_NAME_CHARS = new Set(['<', '>', ':', '\\', '"', '/', '|', '?', '*']);
const FIRST_PRINTABLE_CHAR_CODE = 0x20;

function hasForbiddenCharacter(name: string): boolean {
  for (const character of name) {
    if (FORBIDDEN_NAME_CHARS.has(character)) return true;
    if (character.charCodeAt(0) < FIRST_PRINTABLE_CHAR_CODE) return true;
  }
  return false;
}

/** Validate a single path segment supplied by a user for create/rename. */
export function assertValidEntryName(name: string): void {
  if (!name || name.trim() !== name) {
    throw HearthError.badRequest('Name cannot be empty or padded with spaces');
  }
  if (name === '.' || name === '..') {
    throw HearthError.badRequest('That name is reserved');
  }
  if (hasForbiddenCharacter(name)) {
    throw HearthError.badRequest('Name contains characters that are not allowed');
  }
  if (name.endsWith('.')) {
    throw HearthError.badRequest('Name cannot end with a dot');
  }
  const stem = name.split('.')[0]!.toLowerCase();
  if (RESERVED_NAMES.has(stem)) {
    throw HearthError.badRequest(`"${name}" is a reserved device name on Windows`);
  }
}

/**
 * The single choke point for turning user-supplied paths into filesystem paths.
 * Bound to the runtime state so a root switch is picked up without any caller
 * holding a stale root.
 */
export class Vault {
  /** Canonical form of each root, keyed by its configured path. */
  private readonly canonicalRoots = new Map<string, string>();

  constructor(private readonly runtime: RuntimeState) {}

  get rootPath(): string {
    return this.runtime.activeRoot.absolutePath;
  }

  /**
   * The root as the filesystem itself spells it. A configured root may reach
   * the real directory through a junction, a symlink, or an 8.3 short name; a
   * `realpath` of a file below it would then not appear to be contained.
   */
  private get canonicalRoot(): string {
    const configured = this.rootPath;
    let canonical = this.canonicalRoots.get(configured);
    if (canonical === undefined) {
      try {
        canonical = fs.realpathSync.native(configured);
      } catch {
        canonical = configured;
      }
      this.canonicalRoots.set(configured, canonical);
    }
    return canonical;
  }

  /**
   * Resolve a root-relative path. Throws when it escapes the root, including
   * via a symlink whose target lies outside.
   */
  resolve(userPath: string | undefined): SafePath {
    const raw = userPath ?? '';
    if (typeof raw !== 'string' || raw.includes('\0')) {
      throw HearthError.badRequest('Invalid path');
    }

    const root = this.rootPath;
    const resolved = raw.trim() === '' ? root : path.resolve(root, raw);
    if (!containedIn(resolved, root)) {
      throw HearthError.forbidden('That path is outside the current root');
    }

    // A symlink may point out of the root even though its own path does not.
    try {
      const real = fs.realpathSync.native(resolved);
      if (!containedIn(real, this.canonicalRoot)) {
        throw HearthError.forbidden('That path is outside the current root');
      }
    } catch (error) {
      // Non-existent paths are legitimate targets (upload, mkdir); the string
      // check above is sufficient for them.
      if (error instanceof HearthError) throw error;
    }

    return resolved as SafePath;
  }

  /** Root-relative, forward-slash form — the only path shape the client sees. */
  relativize(absolute: string): string {
    return path.relative(this.rootPath, absolute).replace(/\\/g, '/');
  }

  /**
   * Adopt an absolute path produced by an external index (Everything). Returns
   * null when it is outside the root, so a query-syntax mistake cannot become a
   * path disclosure.
   */
  adopt(absolute: string): SafePath | null {
    const resolved = path.resolve(absolute);
    if (containedIn(resolved, this.rootPath)) return resolved as SafePath;

    // An index reports the canonical path; rebase it so `relativize` still works.
    if (containedIn(resolved, this.canonicalRoot)) {
      return path.join(this.rootPath, path.relative(this.canonicalRoot, resolved)) as SafePath;
    }
    return null;
  }

  /** Join a validated child name onto an already-safe directory. */
  child(parent: SafePath, name: string): SafePath {
    assertValidEntryName(name);
    return path.join(parent, name) as SafePath;
  }
}
