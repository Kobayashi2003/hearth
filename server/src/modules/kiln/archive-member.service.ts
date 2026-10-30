import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

import type { FileEntry } from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import type { RuntimeState } from '../../config/runtime-state.js';
import { writeFileAtomically } from '../../lib/atomic-file.js';
import { HearthError } from '../../lib/errors.js';
import { mimeForPath } from '../../lib/mime.js';
import type { SafePath } from '../../lib/vault.js';
import type { ArchiveService } from './archive.service.js';
import type { OpenedFile } from './stream.service.js';

/**
 * A file inside an archive, opened the way Windows opens one: unpacked once
 * into a cache, then served like any other file. Everything that works on a
 * file (ranges, probing, conversion, thumbnails, text decoding) works on it
 * unchanged. The cost is the unpacking, on first open, and the disk it takes
 * until the cache is cleaned; an administrator can turn it off.
 */
export class ArchiveMemberService {
  /** Two requests for the same member share one unpacking. */
  private readonly unpacking = new Map<string, Promise<string>>();
  /** And two for pictures of the same archive share one unpacking of them all. */
  private readonly unpackingPictures = new Map<string, Promise<void>>();

  constructor(
    private readonly config: AppConfig,
    private readonly runtime: RuntimeState,
    private readonly archives: ArchiveService,
  ) {}

  /** `archive` has been checked readable by the caller; `member` is its name inside. */
  async open(archive: SafePath, archiveEntry: FileEntry, member: string): Promise<OpenedFile> {
    this.assertOn();
    const file = this.fileFor(archive, archiveEntry, member);
    await this.unpacked(file, archive, member);
    return this.opened(file, archiveEntry, member);
  }

  /**
   * A picture for a thumbnail. The first one an archive is asked for unpacks
   * all of its pictures in one reading, since a covers view asks for each in
   * turn and reading the archive once per picture would read it many times over.
   */
  async openPicture(
    archive: SafePath,
    archiveEntry: FileEntry,
    member: string,
  ): Promise<OpenedFile> {
    this.assertOn();
    const file = this.fileFor(archive, archiveEntry, member);
    if (!(await exists(file))) {
      const batch = this.fileFor(archive, archiveEntry, '');
      let running = this.unpackingPictures.get(batch);
      if (!running) {
        running = this.unpackPictures(archive, archiveEntry).finally(() =>
          this.unpackingPictures.delete(batch),
        );
        this.unpackingPictures.set(batch, running);
      }
      await running;
    }
    return this.open(archive, archiveEntry, member);
  }

  private async unpackPictures(archive: SafePath, archiveEntry: FileEntry): Promise<void> {
    const { entries } = await this.archives.list(archive);
    const pictures = entries.filter(
      entry => !entry.isDirectory && !entry.encrypted && entry.mimeType.startsWith('image/'),
    );
    const missing = [];
    for (const picture of pictures) {
      const file = this.fileFor(archive, archiveEntry, picture.name);
      if (!(await exists(file))) missing.push({ name: picture.name, file });
    }
    if (missing.length > 0) await this.archives.unpack(archive, missing);
  }

  private assertOn(): void {
    if (!this.runtime.get('archivePreview')) {
      throw HearthError.forbidden(
        'Opening files inside archives is turned off; download the archive instead',
      );
    }
  }

  /** Where a member is cached: a new version of the archive is a new set of files. */
  private fileFor(archive: SafePath, archiveEntry: FileEntry, member: string): string {
    const key = crypto
      .createHash('sha1')
      .update(`${archive}|${archiveEntry.mtime}|${archiveEntry.size}|${member}`)
      .digest('hex');
    return path.join(
      this.config.media.archiveMemberCacheDirectory,
      key.slice(0, 2),
      `${key}${path.extname(path.posix.basename(member)).toLowerCase()}`,
    );
  }

  private async opened(file: string, archiveEntry: FileEntry, member: string): Promise<OpenedFile> {
    const name = path.posix.basename(member) || 'file';
    const stats = await fsp.stat(file);
    const entry: FileEntry = {
      name,
      path: archiveEntry.path,
      size: stats.size,
      mtime: archiveEntry.mtime,
      mimeType: mimeForPath(name, stats.size),
      isDirectory: false,
    };
    // Hearth wrote this file itself, under its own cache: not a path a person named.
    return { target: file as SafePath, entry };
  }

  private async unpacked(file: string, archive: SafePath, member: string): Promise<void> {
    if (await exists(file)) return;
    let running = this.unpacking.get(file);
    if (!running) {
      // Not tied to one request: whoever asked first may leave, the next still wants it.
      running = this.unpack(file, archive, member).finally(() => this.unpacking.delete(file));
      this.unpacking.set(file, running);
    }
    await running;
  }

  private async unpack(file: string, archive: SafePath, member: string): Promise<string> {
    const { content } = await this.archives.read(archive, member);
    await writeFileAtomically(file, content);
    return file;
  }
}

async function exists(file: string): Promise<boolean> {
  return (await fsp.stat(file).catch(() => null)) !== null;
}
