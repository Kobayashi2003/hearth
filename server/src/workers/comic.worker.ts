import fs from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import AdmZip from 'adm-zip';

import { openRarPages, RAR_EXTENSIONS, rethrow, zipPages } from './comic-pages.js';

/** Extracts every page once into a cache directory. */
export interface ComicRequest {
  archivePath: string;
  /** Directory the pages are written into. */
  cacheDirectory: string;
}

export interface ComicResponse {
  /** Page filenames in reading order, relative to `cacheDirectory`. */
  pages: string[];
}

/** Two chapters may share page names, so the cached name is the ordinal, not the entry name. */
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
  return zipPages(new AdmZip(archivePath)).map(({ entry, name }) => ({
    name,
    content: entry.getData(),
  }));
}

async function readRar(archivePath: string): Promise<Array<{ name: string; content: Uint8Array }>> {
  const { extractor, pages: names } = await openRarPages(archivePath);
  const extracted = [...extractor.extract({ files: names }).files];
  const contentByName = new Map(
    extracted.filter(file => file.extraction).map(file => [file.fileHeader.name, file.extraction!]),
  );

  return names
    .filter(name => contentByName.has(name))
    .map(name => ({ name, content: contentByName.get(name)! }));
}

async function run(request: ComicRequest): Promise<ComicResponse> {
  fs.mkdirSync(request.cacheDirectory, { recursive: true });

  const extension = path.extname(request.archivePath).toLowerCase();
  const entries = RAR_EXTENSIONS.has(extension)
    ? await readRar(request.archivePath)
    : readZip(request.archivePath);

  return { pages: writePages(request.cacheDirectory, entries) };
}

run(workerData as ComicRequest).then(response => parentPort?.postMessage(response), rethrow);
