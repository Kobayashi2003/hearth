import fsp from 'node:fs/promises';
import path from 'node:path';

import { isHiddenSystemEntry, type FileEntry } from '@hearth/shared';

import { fromNodeError, HearthError } from '../../lib/errors.js';
import { DIRECTORY_MIME, mimeForPath } from '../../lib/mime.js';
import type { SafePath, Vault } from '../../lib/vault.js';

/** Reading a directory of N entries costs N stat calls; cap the concurrency. */
const STAT_CONCURRENCY = 64;

export class ListingService {
  constructor(private readonly vault: Vault) {}

  /** Every visible child of `directory`, unsorted and unpaginated. */
  async readDirectory(directory: SafePath): Promise<FileEntry[]> {
    let dirents;
    try {
      dirents = await fsp.readdir(directory, { withFileTypes: true });
    } catch (error) {
      throw fromNodeError(error, 'Could not read that folder');
    }

    const visible = dirents.filter(dirent => !isHiddenSystemEntry(dirent.name));
    const entries: FileEntry[] = [];

    for (let index = 0; index < visible.length; index += STAT_CONCURRENCY) {
      const batch = visible.slice(index, index + STAT_CONCURRENCY);
      const resolved = await Promise.all(
        batch.map(dirent => this.describe(path.join(directory, dirent.name) as SafePath)),
      );
      // A file deleted between readdir and stat yields null; skip it silently.
      entries.push(...resolved.filter((entry): entry is FileEntry => entry !== null));
    }

    return entries;
  }

  /** Describe one path, or null when it has gone away. */
  async describe(target: SafePath): Promise<FileEntry | null> {
    try {
      const stats = await fsp.stat(target);
      const isDirectory = stats.isDirectory();
      return {
        name: path.basename(target),
        path: this.vault.relativize(target),
        size: isDirectory ? 0 : stats.size,
        mtime: stats.mtime.toISOString(),
        mimeType: isDirectory ? DIRECTORY_MIME : mimeForPath(target),
        isDirectory,
      };
    } catch {
      return null;
    }
  }

  /** Describe one path, failing loudly — for endpoints that need the entry. */
  async require(target: SafePath): Promise<FileEntry> {
    const entry = await this.describe(target);
    if (!entry) throw HearthError.notFound('That file or folder no longer exists');
    return entry;
  }

  async assertDirectory(target: SafePath): Promise<void> {
    const entry = await this.require(target);
    if (!entry.isDirectory) throw HearthError.badRequest('That path is a file, not a folder');
  }

  async assertFile(target: SafePath): Promise<FileEntry> {
    const entry = await this.require(target);
    if (entry.isDirectory) throw HearthError.badRequest('That path is a folder, not a file');
    return entry;
  }
}
