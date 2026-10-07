import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { ConfigError, envList, envOptional, envPath, projectRoot } from './env.js';

export interface RootConfig {
  /** Derived from the absolute path, so it survives reordering. */
  id: string;
  absolutePath: string;
  label: string;
}

function rootIdFor(absolutePath: string): string {
  return crypto.createHash('sha1').update(absolutePath.toLowerCase()).digest('hex').slice(0, 12);
}

/** `ROOT_DIRECTORIES`, else `BASE_DIRECTORY`, else ./example; each folder once, however it is spelt. */
export function parseRoots(): RootConfig[] {
  const configured = envList('ROOT_DIRECTORIES');
  const fallback = envPath('BASE_DIRECTORY', './example');
  const rawPaths = configured.length > 0 ? configured : [fallback];

  const seen = new Set<string>();
  const roots: RootConfig[] = [];

  for (const raw of rawPaths) {
    const absolutePath = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(projectRoot, raw);
    const key = absolutePath.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    roots.push({
      id: rootIdFor(absolutePath),
      absolutePath,
      label: path.basename(absolutePath) || absolutePath,
    });
  }

  if (roots.length === 0) throw new ConfigError('ROOT_DIRECTORIES', 'no root directory resolved');
  return roots;
}

/** `BASE_DIRECTORY` names the root served first; otherwise the first listed. */
export function defaultRootOf(roots: RootConfig[]): RootConfig {
  const requested = envOptional('BASE_DIRECTORY');
  if (!requested) return roots[0]!;
  const wanted = path.resolve(projectRoot, requested).toLowerCase();
  return roots.find(root => root.absolutePath.toLowerCase() === wanted) ?? roots[0]!;
}

/**
 * Whether a root can be served right now. A missing root does not stop Hearth
 * from starting: a drive that is not mounted yet, or a disconnected one, is
 * reported as unavailable and served as soon as it is back.
 */
export function rootAvailable(root: RootConfig): boolean {
  try {
    return fs.statSync(root.absolutePath).isDirectory();
  } catch {
    return false;
  }
}
