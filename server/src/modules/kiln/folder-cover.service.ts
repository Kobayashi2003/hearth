import path from 'node:path';
import fsp from 'node:fs/promises';

import { hasCoverArt, isHiddenSystemEntry } from '@hearth/shared';

import { imageSize } from '../../workers/comic-pages.js';

import { mimeForPath } from '../../lib/mime.js';
import type { SafePath } from '../../lib/vault.js';

/**
 * Which file stands in for a folder on a cover wall.
 *
 * A shelf of manga is a shelf of *series folders*, so a grid that can only draw
 * files is a grid of identical icons — the first screen of the product would be
 * blank. A folder borrows the cover of the first coverable thing inside it.
 */

/** Natural order, so volume 10 follows volume 9 rather than volume 1. */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * How deep to look. A series folder usually holds volumes directly, but one
 * level of nesting (`Series/Volume 1/001.jpg`) is common enough to be worth
 * following. Beyond that the cost stops being worth the picture.
 */
const MAX_DEPTH = 2;

/** Subdirectories tried per level, so a folder of hundreds cannot stall a tile. */
const MAX_BRANCHES = 6;

/** Enough for a large library; bounded so a long session cannot grow it forever. */
const MEMO_LIMIT = 2000;

/**
 * How many leading images to weigh before settling for the first.
 *
 * Raw scans usually lead with the wraparound jacket — front, spine and back on
 * one landscape sheet — and cropping that into a 2:3 tile yields a barcode. The
 * same rule the cover worker applies inside an archive, applied here to a folder
 * of loose pages, which is how most of this library is actually stored.
 */
const JACKET_SCAN_DEPTH = 3;
/** Enough of a file to hold any of the headers `imageSize` reads. */
const HEADER_BYTES = 64 * 1024;

interface Memo {
  /** The directory's mtime when this was resolved — adding a file invalidates it. */
  mtimeMs: number;
  source: SafePath | null;
}

export class FolderCoverService {
  private readonly memo = new Map<string, Memo>();

  /**
   * Resolving means reading directories, and a grid asks for every visible tile
   * at once. The answer is memoised against the folder's mtime so a second look
   * at the same shelf costs nothing, and adding a file re-resolves.
   */
  async sourceFor(directory: SafePath, signal?: AbortSignal): Promise<SafePath | null> {
    const stats = await fsp.stat(directory).catch(() => null);
    if (!stats) return null;

    const cached = this.memo.get(directory);
    if (cached && cached.mtimeMs === stats.mtimeMs) return cached.source;

    const source = await this.search(directory, MAX_DEPTH, signal);

    // Plain FIFO eviction: the working set is whichever folder is on screen, and
    // anything cleverer would cost more than re-reading a directory.
    if (this.memo.size >= MEMO_LIMIT) {
      const oldest = this.memo.keys().next().value;
      if (oldest !== undefined) this.memo.delete(oldest);
    }
    this.memo.set(directory, { mtimeMs: stats.mtimeMs, source });

    return source;
  }

  private async search(
    directory: SafePath,
    depth: number,
    signal?: AbortSignal,
  ): Promise<SafePath | null> {
    if (signal?.aborted) return null;

    const dirents = await fsp.readdir(directory, { withFileTypes: true }).catch(() => null);
    if (!dirents) return null;

    const visible = dirents
      .filter(dirent => !isHiddenSystemEntry(dirent.name))
      .sort((a, b) => collator.compare(a.name, b.name));

    // Files first: a cover sitting directly in the folder beats one buried in a
    // subfolder, and finding it costs no further reads.
    const candidates: SafePath[] = [];
    for (const dirent of visible) {
      if (dirent.isDirectory()) continue;
      const child = path.join(directory, dirent.name) as SafePath;
      const entry = { name: dirent.name, mimeType: mimeForPath(child), isDirectory: false };
      if (hasCoverArt(entry)) candidates.push(child);
      if (candidates.length >= JACKET_SCAN_DEPTH) break;
    }

    if (candidates.length > 0) return await pickPortrait(candidates);

    if (depth <= 0) return null;

    let branches = 0;
    for (const dirent of visible) {
      if (!dirent.isDirectory()) continue;
      if (branches >= MAX_BRANCHES) break;
      branches += 1;

      const found = await this.search(
        path.join(directory, dirent.name) as SafePath,
        depth - 1,
        signal,
      );
      if (found) return found;
    }

    return null;
  }
}

/**
 * The first candidate that is not a landscape sheet, or the first one if they
 * all are — a book that is landscape throughout is a landscape book.
 *
 * Only the header is read, not the file: a 12 MB scan costs 64 KB to measure.
 */
async function pickPortrait(candidates: SafePath[]): Promise<SafePath> {
  for (const candidate of candidates) {
    const size = await readImageSize(candidate);
    // Unmeasurable means an unrecognised container, not a jacket — take it.
    if (!size || size.height >= size.width) return candidate;
  }
  return candidates[0]!;
}

async function readImageSize(target: SafePath): Promise<{ width: number; height: number } | null> {
  let handle;
  try {
    handle = await fsp.open(target, 'r');
    const buffer = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0);
    return imageSize(buffer.subarray(0, bytesRead));
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
