import path from 'node:path';

import {
  ARCHIVE_EXTENSIONS,
  READABLE_ARCHIVE_EXTENSIONS,
  type ArchiveListing,
} from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import { HearthError } from '../../lib/errors.js';
import { runWorker } from '../../lib/worker.js';
import type { SafePath } from '../../lib/vault.js';
import type {
  ArchiveListResponse,
  ArchiveReadResponse,
  ArchiveRequest,
} from '../../workers/archive.worker.js';

/** An archive's listing and single members. Unlike comics, nothing is cached or unpacked to disk. */
export class ArchiveService {
  constructor(private readonly config: AppConfig) {}

  async list(target: SafePath, signal?: AbortSignal): Promise<ArchiveListing> {
    this.assertReadable(target);

    const response = await runWorker<ArchiveRequest, ArchiveListResponse>(
      'archive',
      { kind: 'list', archivePath: target, limit: this.config.media.archiveMaxEntries },
      signal,
    );

    return {
      entries: response.entries,
      total: response.total,
      hasMore: response.hasMore,
      looksLikeComic: response.looksLikeComic,
    };
  }

  async read(
    target: SafePath,
    entryName: string,
    signal?: AbortSignal,
  ): Promise<{ content: Buffer; name: string }> {
    this.assertReadable(target);
    if (entryName.length === 0) throw HearthError.badRequest('No archive member was named');

    const response = await runWorker<ArchiveRequest, ArchiveReadResponse>(
      'archive',
      {
        kind: 'read',
        archivePath: target,
        entryName,
        maxBytes: this.config.media.archiveMaxMemberBytes,
      },
      signal,
    );

    if (!response.found) throw HearthError.notFound('That file is not in this archive');
    if (response.tooLarge) {
      throw HearthError.badRequest('That file is too large to open from inside the archive');
    }

    return {
      content: Buffer.from(response.content),
      name: path.posix.basename(entryName) || 'file',
    };
  }

  private assertReadable(target: string): void {
    const extension = path.extname(target).toLowerCase();
    if (!ARCHIVE_EXTENSIONS.has(extension) && !READABLE_ARCHIVE_EXTENSIONS.has(extension)) {
      throw HearthError.badRequest('That file is not an archive');
    }
    if (!READABLE_ARCHIVE_EXTENSIONS.has(extension)) {
      throw HearthError.badRequest(
        `Hearth can look inside zip and rar archives; ${extension} has to be downloaded first`,
      );
    }
  }
}
