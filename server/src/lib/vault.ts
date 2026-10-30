import fs from 'node:fs';
import path from 'node:path';

import { HearthError } from './errors.js';
import { rootAvailable } from '../config/roots.js';
import type { RuntimeState } from '../config/runtime-state.js';

/**
 * A path proven to live inside the active root. Only `Vault` mints one, so
 * traversal becomes a type error rather than a review item.
 */
declare const safePathBrand: unique symbol;
export type SafePath = string & { readonly [safePathBrand]: true };

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
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

const FORBIDDEN_NAME_CHARS = new Set(['<', '>', ':', '\\', '"', '/', '|', '?', '*']);
const FIRST_PRINTABLE_CHAR_CODE = 0x20;

function hasForbiddenCharacter(name: string): boolean {
  for (const character of name) {
    if (FORBIDDEN_NAME_CHARS.has(character)) return true;
    if (character.charCodeAt(0) < FIRST_PRINTABLE_CHAR_CODE) return true;
  }
  return false;
}

/** One path segment supplied for create/rename. */
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

/** How long "the root is there" is trusted before looking again. */
const ROOT_CHECK_MS = 3000;

/** The single choke point from user paths to filesystem paths. Reads the active root on every use. */
export class Vault {
  private readonly canonicalRoots = new Map<string, string>();
  private rootSeen = { path: '', at: 0 };

  constructor(private readonly runtime: RuntimeState) {}

  /**
   * A root on a drive that is not connected answers every path with "not
   * found", which reads as files having vanished; say what is really wrong.
   */
  private assertRootAvailable(): void {
    const root = this.runtime.activeRoot;
    if (this.rootSeen.path === root.absolutePath && Date.now() - this.rootSeen.at < ROOT_CHECK_MS) {
      return;
    }
    if (!rootAvailable(root)) {
      // A canonical path learned while the drive was mounted may differ when it returns.
      this.canonicalRoots.delete(root.absolutePath);
      throw new HearthError(
        'ROOT_UNAVAILABLE',
        `${root.label} is not available right now; is its drive connected?`,
      );
    }
    this.rootSeen = { path: root.absolutePath, at: Date.now() };
  }

  get rootPath(): string {
    return this.runtime.activeRoot.absolutePath;
  }

  /** The root as `realpath` spells it (junctions, symlinks, 8.3 names), for comparing realpaths. */
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

  /** Throws when the path escapes the root, including through a symlink. */
  resolve(userPath: string | undefined): SafePath {
    const raw = userPath ?? '';
    if (typeof raw !== 'string' || raw.includes('\0')) {
      throw HearthError.badRequest('Invalid path');
    }

    this.assertRootAvailable();
    const root = this.rootPath;
    const resolved = raw.trim() === '' ? root : path.resolve(root, raw);
    if (!containedIn(resolved, root)) {
      throw HearthError.forbidden('That path is outside the current root');
    }

    // A symlink or junction may point out of the root even though its own path
    // does not. For a path that does not exist yet (an upload, a new folder),
    // the folders it would be made in are what must stay inside.
    if (!containedIn(this.realOf(resolved), this.canonicalRoot)) {
      throw HearthError.forbidden('That path is outside the current root');
    }

    return resolved as SafePath;
  }

  /**
   * Where `target` really is: its own realpath, or for one not there yet, its
   * nearest existing folder's realpath with the missing names after it. Any
   * other failure to tell refuses, rather than letting the string check stand.
   */
  private realOf(target: string): string {
    const missing: string[] = [];
    for (let current = target; ; current = path.dirname(current)) {
      try {
        return path.join(fs.realpathSync.native(current), ...missing.reverse());
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if ((code !== 'ENOENT' && code !== 'ENOTDIR') || path.dirname(current) === current) {
          throw HearthError.forbidden('That path cannot be checked');
        }
        missing.push(path.basename(current));
      }
    }
  }

  /**
   * The same file as the filesystem spells it, root-relative: Windows takes
   * `BUNDLE/SECRET.TXT`, `bundle~1/secret.txt` or `secret.txt.` for
   * `bundle/secret.txt`, and a rule written for one must hold for all. Null
   * when it does not exist or lies outside the root's own tree (through a link).
   */
  realRelative(target: SafePath): string | null {
    let real: string;
    try {
      real = fs.realpathSync.native(target);
    } catch {
      return null;
    }
    if (!containedIn(real, this.canonicalRoot)) return null;
    return path.relative(this.canonicalRoot, real).replace(/\\/g, '/');
  }

  /** Root-relative, forward slashes: the only path shape the client sees. */
  relativize(absolute: string): string {
    return path.relative(this.rootPath, absolute).replace(/\\/g, '/');
  }

  /** For paths from an external index (Everything): null when outside the root. */
  adopt(absolute: string): SafePath | null {
    const resolved = path.resolve(absolute);
    if (containedIn(resolved, this.rootPath)) return resolved as SafePath;

    if (containedIn(resolved, this.canonicalRoot)) {
      return path.join(this.rootPath, path.relative(this.canonicalRoot, resolved)) as SafePath;
    }
    return null;
  }

  child(parent: SafePath, name: string): SafePath {
    assertValidEntryName(name);
    return path.join(parent, name) as SafePath;
  }
}
