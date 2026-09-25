import fs from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import AdmZip from 'adm-zip';
import { createExtractorFromData } from 'node-unrar-js';

import { collator, isPage, RAR_EXTENSIONS, rethrow, zipEntryNames } from './comic-pages.js';

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
  const entries = new AdmZip(archivePath).getEntries();
  const names = zipEntryNames(entries);
  return entries
    .filter(entry => !entry.isDirectory && isPage(names.get(entry)!))
    .sort((a, b) => collator.compare(names.get(a)!, names.get(b)!))
    .map(entry => ({ name: names.get(entry)!, content: entry.getData() }));
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
