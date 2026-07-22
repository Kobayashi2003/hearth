import fs from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import AdmZip from 'adm-zip';
import { createExtractorFromData } from 'node-unrar-js';

/**
 * Comic archive extraction. Runs off the event loop because decompressing a few
 * hundred megabytes of JPEGs blocks for seconds.
 *
 * Pages are extracted once into a cache directory and served as ordinary files
 * afterwards, so paging through a comic does not re-open the archive per page.
 */
export interface ComicRequest {
  archivePath: string;
  /** Directory the pages are written into. */
  cacheDirectory: string;
}

export interface ComicResponse {
  /** Page filenames in reading order, relative to `cacheDirectory`. */
  pages: string[];
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif']);

/** Natural order, so page 10 follows page 9 rather than page 1. */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function isPage(entryName: string): boolean {
  const base = path.basename(entryName);
  // Skip macOS resource forks, which otherwise appear as duplicate pages.
  if (base.startsWith('.') || entryName.includes('__MACOSX/')) return false;
  return IMAGE_EXTENSIONS.has(path.extname(base).toLowerCase());
}

/**
 * Entries are flattened into one directory, but a comic may hold two chapters
 * with identically-named pages — so the full entry path decides the order while
 * the position in that order becomes the cached filename.
 */
function pageFileName(entryName: string, ordinal: number): string {
  return `${String(ordinal).padStart(4, '0')}${path.extname(entryName).toLowerCase()}`;
}

function writePages(
  cacheDirectory: string,
  entries: Array<{ name: string; content: Uint8Array }>,
): string[] {
  return entries.map((entry, ordinal) => {
    const fileName = pageFileName(entry.name, ordinal);
    fs.writeFileSync(path.join(cacheDirectory, fileName), entry.content);
    return fileName;
  });
}

function readZip(archivePath: string): Array<{ name: string; content: Uint8Array }> {
  return new AdmZip(archivePath)
    .getEntries()
    .filter(entry => !entry.isDirectory && isPage(entry.entryName))
    .sort((a, b) => collator.compare(a.entryName, b.entryName))
    .map(entry => ({ name: entry.entryName, content: entry.getData() }));
}

async function readRar(archivePath: string): Promise<Array<{ name: string; content: Uint8Array }>> {
  const file = fs.readFileSync(archivePath);
  const extractor = await createExtractorFromData({
    data: file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer,
  });

  const names = [...extractor.getFileList().fileHeaders]
    .filter(header => !header.flags.directory && isPage(header.name))
    .map(header => header.name)
    .sort(collator.compare);

  const extracted = [...extractor.extract({ files: names }).files];
  const contentByName = new Map(
    extracted
      .filter(file => file.extraction)
      .map(file => [file.fileHeader.name, file.extraction!]),
  );

  return names
    .filter(name => contentByName.has(name))
    .map(name => ({ name, content: contentByName.get(name)! }));
}

const RAR_EXTENSIONS = new Set(['.rar', '.cbr']);

async function run(request: ComicRequest): Promise<ComicResponse> {
  fs.mkdirSync(request.cacheDirectory, { recursive: true });

  const extension = path.extname(request.archivePath).toLowerCase();
  const entries = RAR_EXTENSIONS.has(extension)
    ? await readRar(request.archivePath)
    : readZip(request.archivePath);

  return { pages: writePages(request.cacheDirectory, entries) };
}

void run(workerData as ComicRequest).then(response => parentPort?.postMessage(response));
