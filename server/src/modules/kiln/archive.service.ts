import path from 'node:path';

import {
  ARCHIVE_EXTENSIONS,
  READABLE_ARCHIVE_EXTENSIONS,
  type ArchiveListing,
} from '@hearth/shared';

import type { RuntimeState } from '../../config/runtime-state.js';
import { HearthError } from '../../lib/errors.js';
import { mimeForPath } from '../../lib/mime.js';
import { runWorker, unreadable } from '../../lib/worker.js';
import type { SafePath } from '../../lib/vault.js';
import type {
  ArchiveListResponse,
  ArchiveReadResponse,
  ArchiveRequest,
  ArchiveUnpackResponse,
  UnpackTarget,
} from '../../workers/archive.worker.js';

const MB = 1024 * 1024;
const DAMAGED =
  'This archive could not be read; it may be damaged or in a format Hearth cannot open';

/** An archive's listing and single members, read into memory; `ArchiveMemberService` caches them on disk. */
export class ArchiveService {
  constructor(private readonly runtime: RuntimeState) {}

  async list(target: SafePath, signal?: AbortSignal): Promise<ArchiveListing> {
    this.assertReadable(target);

    const response = await runWorker<ArchiveRequest, ArchiveListResponse>(
      'archive',
      { kind: 'list', archivePath: target, limit: this.runtime.get('archiveMaxEntries') },
      signal,
    ).catch(unreadable(DAMAGED));

    return {
      entries: response.entries.map(entry => ({
        ...entry,
        mimeType: entry.isDirectory ? '' : mimeForPath(entry.name, entry.size),
      })),
      total: response.total,
      hasMore: response.hasMore,
      looksLikeComic: response.looksLikeComic,
      membersOpen: this.runtime.get('archivePreview'),
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
        maxBytes: this.runtime.get('archiveMaxMemberSizeMB') * MB,
      },
      signal,
    ).catch(unreadable(DAMAGED));

    if (!response.found) throw HearthError.notFound('That file is not in this archive');
    if (response.encrypted) {
      throw HearthError.badRequest(
        'That file is password-protected; download the archive to open it',
      );
    }
    if (response.tooLarge) {
      throw HearthError.badRequest('That file is too large to open from inside the archive');
    }

    return {
      content: Buffer.from(response.content),
      name: path.posix.basename(entryName) || 'file',
    };
  }

  /**
   * Several members, each written to its file, in one reading of the archive.
   * Returns the names written: a missing, encrypted or too large one is skipped.
   */
  async unpack(target: SafePath, members: UnpackTarget[], signal?: AbortSignal): Promise<string[]> {
    this.assertReadable(target);
    const response = await runWorker<ArchiveRequest, ArchiveUnpackResponse>(
      'archive',
      {
        kind: 'unpack',
        archivePath: target,
        members,
        maxBytes: this.runtime.get('archiveMaxMemberSizeMB') * MB,
      },
      signal,
    ).catch(unreadable(DAMAGED));
    return response.written;
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
