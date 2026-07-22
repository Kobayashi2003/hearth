import fs from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import { isHiddenSystemEntry } from '@hearth/shared';

/**
 * Recursive name search on the filesystem. Runs off the event loop because a
 * deep tree can take seconds, and the main thread must keep streaming media
 * while it does.
 */
export interface WalkRequest {
  rootDirectory: string;
  /** Lower-cased terms; an entry must contain all of them. */
  terms: string[];
  /** Lower-cased extensions without the dot; empty means any. */
  extensions: string[];
  recursive: boolean;
  /** Stop after this many matches so a pathological tree cannot exhaust memory. */
  maxResults: number;
}

export interface WalkMatch {
  absolutePath: string;
  name: string;
  size: number;
  mtimeMs: number;
  isDirectory: boolean;
}

export interface WalkResponse {
  matches: WalkMatch[];
  /** True when the walk stopped at `maxResults` and the total is a floor. */
  truncated: boolean;
}

function matches(name: string, request: WalkRequest, isDirectory: boolean): boolean {
  const lower = name.toLowerCase();
  if (!request.terms.every(term => lower.includes(term))) return false;

  if (request.extensions.length > 0) {
    if (isDirectory) return false;
    const extension = path.extname(lower).slice(1);
    if (!request.extensions.includes(extension)) return false;
  }
  return true;
}

function walk(request: WalkRequest): WalkResponse {
  const found: WalkMatch[] = [];
  const queue: string[] = [request.rootDirectory];

  while (queue.length > 0) {
    if (found.length >= request.maxResults) return { matches: found, truncated: true };

    const directory = queue.shift()!;
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      // An unreadable subtree is skipped rather than failing the whole search.
      continue;
    }

    for (const dirent of dirents) {
      if (isHiddenSystemEntry(dirent.name)) continue;

      const absolutePath = path.join(directory, dirent.name);
      const isDirectory = dirent.isDirectory();

      if (isDirectory && request.recursive) queue.push(absolutePath);

      if (!matches(dirent.name, request, isDirectory)) continue;
      if (found.length >= request.maxResults) return { matches: found, truncated: true };

      try {
        const stats = fs.statSync(absolutePath);
        found.push({
          absolutePath,
          name: dirent.name,
          size: isDirectory ? 0 : stats.size,
          mtimeMs: stats.mtimeMs,
          isDirectory,
        });
      } catch {
        // Vanished between readdir and stat.
      }
    }
  }

  return { matches: found, truncated: false };
}

parentPort?.postMessage(walk(workerData as WalkRequest));
