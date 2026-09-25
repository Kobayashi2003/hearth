import fs from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import { isHiddenSystemEntry } from '@hearth/shared';

/** Breadth-first name search; a deep tree takes seconds, so it runs off the event loop. */
export interface WalkRequest {
  rootDirectory: string;
  /** Lower-cased terms; an entry must contain all of them. */
  terms: string[];
  /** Lower-cased extensions without the dot; empty means any. */
  extensions: string[];
  recursive: boolean;
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

  for (let head = 0; head < queue.length; head += 1) {
    if (found.length >= request.maxResults) return { matches: found, truncated: true };

    const directory = queue[head]!;
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
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
