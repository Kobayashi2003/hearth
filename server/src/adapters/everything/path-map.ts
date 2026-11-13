import path from 'node:path';

import { containedIn } from '../../lib/vault.js';

/**
 * One folder as Hearth reaches it (`\\nas\Media`, `Z:\Media`) and as an
 * Everything on another machine indexes it (`D:\Media`). Everything runs only
 * on Windows, so the remote side is always a Windows path.
 */
export interface PathMap {
  local: string;
  remote: string;
}

/** Windows paths, whatever this machine runs: compared without case. */
function insideRemote(candidate: string, root: string): boolean {
  const prefix = root.endsWith('\\') ? root : `${root}\\`;
  const lower = candidate.toLowerCase();
  return lower === root.toLowerCase() || lower.startsWith(prefix.toLowerCase());
}

/** The map that covers `local` most specifically (`I:\Saves` before `I:\`), if any does. */
export function mapFor(maps: readonly PathMap[], local: string): PathMap | null {
  let best: PathMap | null = null;
  for (const map of maps) {
    if (!containedIn(local, map.local)) continue;
    if (best === null || map.local.length > best.local.length) best = map;
  }
  return best;
}

/** `null`: the folder lies outside what the map covers. */
export function toRemote(map: PathMap, local: string): string | null {
  if (!containedIn(local, map.local)) return null;
  const rest = path.relative(map.local, local).split(path.sep).filter(Boolean);
  return path.win32.join(map.remote, ...rest);
}

/** `null`: Everything reported something outside the mapped folder, which is never shown. */
export function toLocal(map: PathMap, remote: string): string | null {
  const normalized = path.win32.normalize(remote);
  if (!insideRemote(normalized, map.remote)) return null;
  const rest = path.win32.relative(map.remote, normalized).split('\\').filter(Boolean);
  if (rest.includes('..')) return null;
  return path.join(map.local, ...rest);
}
