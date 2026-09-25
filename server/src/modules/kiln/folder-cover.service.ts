import path from 'node:path';
import fsp from 'node:fs/promises';

import { hasCoverArt, isHiddenSystemEntry } from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import { mimeForPath } from '../../lib/mime.js';
import { imageSize } from '../../workers/comic-pages.js';
import type { SafePath } from '../../lib/vault.js';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const MEMO_LIMIT = 2000;
/** Scans often lead with a landscape wraparound jacket, which crops into a barcode; look a few pages further. */
const JACKET_SCAN_DEPTH = 3;
const HEADER_BYTES = 64 * 1024;

interface Memo {
  mtimeMs: number;
  source: SafePath | null;
}

/** Which file stands in for a folder on a cover grid: the first coverable thing inside it. */
export class FolderCoverService {
  private readonly memo = new Map<string, Memo>();

  /** Depth 2 follows `Series/Volume 1/001.jpg`; branches bound how many subfolders are tried per level. */
  constructor(private readonly config: AppConfig) {}

  /** Memoised against the folder's mtime, so adding a file re-resolves. */
  async sourceFor(directory: SafePath, signal?: AbortSignal): Promise<SafePath | null> {
    const stats = await fsp.stat(directory).catch(() => null);
    if (!stats) return null;

    const cached = this.memo.get(directory);
    if (cached && cached.mtimeMs === stats.mtimeMs) return cached.source;

    const source = await this.search(directory, this.config.media.folderCoverMaxDepth, signal);

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

    // Files directly inside beat anything in a subfolder.
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
      if (branches >= this.config.media.folderCoverMaxBranches) break;
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

/** The first portrait candidate, or the first one if all are landscape. Reads headers only. */
async function pickPortrait(candidates: SafePath[]): Promise<SafePath> {
  for (const candidate of candidates) {
    const size = await readImageSize(candidate);
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
