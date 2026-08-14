import path from 'node:path';

import {
  ARCHIVE_EXTENSIONS,
  READABLE_ARCHIVE_EXTENSIONS,
  type ArchiveListing,
} from '@hearth/shared';

import { HearthError } from '../../lib/errors.js';
import { runWorker } from '../../lib/worker-pool.js';
import type { SafePath } from '../../lib/vault.js';
import type {
  ArchiveListResponse,
  ArchiveReadResponse,
  ArchiveRequest,
} from '../../workers/archive.worker.js';

/**
 * Reading an archive's table of contents, and one member out of it.
 *
 * Nothing is cached and nothing is unpacked to disk — unlike a comic, which is
 * paged through hundreds of times and so is worth extracting once. An archive is
 * usually opened, looked at, and closed, and leaving a copy of it in a cache
 * directory for that would be the wrong trade.
 */

/**
 * The listing cap. An archive with more members than this is shown as a prefix,
 * the same way an enormous folder is: the alternative is a response measured in
 * megabytes for a list nobody will scroll.
 */
const MAX_ENTRIES = 5_000;

/**
 * The largest member that may be pulled out and served inline. Big enough for a
 * document or a page scan; past it the archive is the thing to download.
 */
const MAX_MEMBER_BYTES = 64 * 1024 * 1024;

export class ArchiveService {
  async list(target: SafePath, signal?: AbortSignal): Promise<ArchiveListing> {
    this.assertReadable(target);

    const response = await runWorker<ArchiveRequest, ArchiveListResponse>(
      'archive',
      { kind: 'list', archivePath: target, limit: MAX_ENTRIES },
      signal,
    );

    return {
      entries: response.entries,
      total: response.total,
      hasMore: response.hasMore,
      looksLikeComic: response.looksLikeComic,
    };
  }

  /** The bytes of one member, for viewing or downloading it on its own. */
  async read(
    target: SafePath,
    entryName: string,
    signal?: AbortSignal,
  ): Promise<{ content: Buffer; name: string }> {
    this.assertReadable(target);
    if (entryName.length === 0) throw HearthError.badRequest('No archive member was named');

    const response = await runWorker<ArchiveRequest, ArchiveReadResponse>(
      'archive',
      { kind: 'read', archivePath: target, entryName, maxBytes: MAX_MEMBER_BYTES },
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
      // Stated plainly rather than dressed up as a failure: zip and rar are what
      // Hearth can open, and the file is still perfectly downloadable.
      throw HearthError.badRequest(
        `Hearth can look inside zip and rar archives; ${extension} has to be downloaded first`,
      );
    }
  }
}
