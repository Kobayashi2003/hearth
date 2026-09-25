import fsp from 'node:fs/promises';
import path from 'node:path';

import { isHiddenSystemEntry, type FileEntry } from '@hearth/shared';

import { fromNodeError, HearthError } from '../../lib/errors.js';
import { DIRECTORY_MIME, mimeForPath } from '../../lib/mime.js';
import type { SafePath, Vault } from '../../lib/vault.js';

/** A directory of N entries costs N stat calls; this bounds how many run at once. */
const STAT_CONCURRENCY = 64;

export class ListingService {
  constructor(private readonly vault: Vault) {}

  /** Every visible child of `directory`, unsorted. */
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
      const described = await Promise.all(
        batch.map(dirent => this.describe(path.join(directory, dirent.name) as SafePath)),
      );
      entries.push(...described.filter((entry): entry is FileEntry => entry !== null));
    }
    return entries;
  }

  /** Null when the path has gone away. */
  async describe(target: SafePath): Promise<FileEntry | null> {
    try {
      const stats = await fsp.stat(target);
      const isDirectory = stats.isDirectory();
      return {
        name: path.basename(target),
        path: this.vault.relativize(target),
        size: isDirectory ? 0 : stats.size,
        mtime: stats.mtime.toISOString(),
        mimeType: isDirectory ? DIRECTORY_MIME : mimeForPath(target, stats.size),
        isDirectory,
      };
    } catch {
      return null;
    }
  }

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
