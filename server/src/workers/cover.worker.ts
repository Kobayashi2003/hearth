import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import AdmZip from 'adm-zip';

import {
  coverHrefFrom,
  imageSize,
  openRarPages,
  RAR_EXTENSIONS,
  rethrow,
  zipPages,
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
  const pages = zipPages(zip);
  if (pages.length === 0) return null;

  for (const { entry, name } of pages.slice(0, JACKET_SCAN_DEPTH)) {
    const content = entry.getData();
    const size = imageSize(content);
    if (!size || size.height >= size.width) return { content, name };
  }

  const fallback = pages[0]!;
  return { content: fallback.entry.getData(), name: fallback.name };
}

async function rarCover(archivePath: string): Promise<CoverResponse | null> {
  const { extractor, pages } = await openRarPages(archivePath);
  const first = pages[0];
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
