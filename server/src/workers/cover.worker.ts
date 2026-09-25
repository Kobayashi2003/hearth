import fs from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import AdmZip from 'adm-zip';
import { createExtractorFromData } from 'node-unrar-js';

import {
  collator,
  coverHrefFrom,
  imageSize,
  isPage,
  RAR_EXTENSIONS,
  rethrow,
  zipEntryNames,
} from './comic-pages.js';

/**
 * The cover of a book and nothing else — drawing a shelf must not unpack every
 * volume on it. For a zip (CBZ, EPUB) only one entry is inflated.
 */
export interface CoverRequest {
  archivePath: string;
  kind: 'comic' | 'epub';
}

export interface CoverResponse {
  content: Uint8Array;
  name: string;
}

/** Skips a leading landscape wraparound jacket in favour of the next portrait page. */
const JACKET_SCAN_DEPTH = 3;

function firstImage(zip: AdmZip): CoverResponse | null {
  const entries = zip.getEntries();
  const names = zipEntryNames(entries);
  const pages = entries
    .filter(entry => !entry.isDirectory && isPage(names.get(entry)!))
    .sort((a, b) => collator.compare(names.get(a)!, names.get(b)!));

  if (pages.length === 0) return null;

  for (const entry of pages.slice(0, JACKET_SCAN_DEPTH)) {
    const content = entry.getData();
    const size = imageSize(content);
    if (!size || size.height >= size.width) {
      return { content, name: names.get(entry)! };
    }
  }

  const fallback = pages[0]!;
  return { content: fallback.getData(), name: names.get(fallback)! };
}

async function rarCover(archivePath: string): Promise<CoverResponse | null> {
  const file = fs.readFileSync(archivePath);
  const extractor = await createExtractorFromData({
    data: file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer,
  });

  const first = [...extractor.getFileList().fileHeaders]
    .filter(header => !header.flags.directory && isPage(header.name))
    .map(header => header.name)
    .sort(collator.compare)[0];
  if (!first) return null;

  const extracted = [...extractor.extract({ files: [first] }).files][0];
  return extracted?.extraction ? { content: extracted.extraction, name: first } : null;
}

/** Follows container.xml → OPF → declared cover, falling back to the first image. */
function epubCover(archivePath: string): CoverResponse | null {
  const zip = new AdmZip(archivePath);

  const href = declaredCoverHref(zip);
  if (href) {
    const entry = zip.getEntry(href);
    if (entry) return { content: entry.getData(), name: entry.entryName };
  }

  return firstImage(zip);
}

function declaredCoverHref(zip: AdmZip): string | null {
  const read = (name: string): string | null => {
    const entry = zip.getEntry(name);
    return entry ? entry.getData().toString('utf8') : null;
  };

  const container = read('META-INF/container.xml');
  return container ? coverHrefFrom(container, read) : null;
}

async function run(request: CoverRequest): Promise<CoverResponse | null> {
  if (request.kind === 'epub') return epubCover(request.archivePath);

  const extension = path.extname(request.archivePath).toLowerCase();
  return RAR_EXTENSIONS.has(extension)
    ? rarCover(request.archivePath)
    : firstImage(new AdmZip(request.archivePath));
}

run(workerData as CoverRequest).then(response => parentPort?.postMessage(response), rethrow);
