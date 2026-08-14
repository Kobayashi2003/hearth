import fs from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import AdmZip from 'adm-zip';
import { createExtractorFromData } from 'node-unrar-js';

import { collator, coverHrefFrom, imageSize, isPage, RAR_EXTENSIONS } from './comic-pages.js';

/**
 * The cover of a book, and nothing else.
 *
 * Deliberately separate from the comic extraction worker: drawing a shelf of
 * covers must not unpack every volume on it. A folder of two hundred comics
 * would otherwise cost tens of gigabytes of cache to render one screen.
 *
 * For a zip — which both CBZ and EPUB are — the cost really is one entry:
 * `adm-zip` reads the central directory and inflates only what is asked for. A
 * RAR has to be held in memory to be opened at all, which is why this runs off
 * the event loop.
 */
export interface CoverRequest {
  archivePath: string;
  /** EPUB declares its cover in metadata; a comic's cover is just page one. */
  kind: 'comic' | 'epub';
}

export interface CoverResponse {
  /** Raw bytes of the cover image, for the thumbnailer to decode. */
  content: Uint8Array;
  /** Its name inside the archive, so the extension identifies the format. */
  name: string;
}

/**
 * The cover page, in reading order.
 *
 * Scans often lead with the wraparound jacket — front, spine and back in one
 * landscape image — and cropping that into a 2:3 tile yields a barcode. When the
 * first page is wider than it is tall, the next portrait page is used instead.
 * Only the first few are examined: a book that is landscape throughout is a
 * landscape book, and its first page really is its cover.
 */
const JACKET_SCAN_DEPTH = 3;

function firstImage(zip: AdmZip): CoverResponse | null {
  const pages = zip
    .getEntries()
    .filter(entry => !entry.isDirectory && isPage(entry.entryName))
    .sort((a, b) => collator.compare(a.entryName, b.entryName));

  if (pages.length === 0) return null;

  for (const entry of pages.slice(0, JACKET_SCAN_DEPTH)) {
    const content = entry.getData();
    const size = imageSize(content);
    // Unknown dimensions mean an unrecognised container; take it and move on
    // rather than reading the whole book looking for something measurable.
    if (!size || size.height >= size.width) {
      return { content, name: entry.entryName };
    }
  }

  const fallback = pages[0]!;
  return { content: fallback.getData(), name: fallback.entryName };
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

/**
 * An EPUB names its cover rather than ordering it first, so the declaration has
 * to be followed: `container.xml` points at the OPF package, and the package
 * either marks an item `cover-image` (EPUB 3) or names one through a `cover`
 * meta tag (EPUB 2). Anything unrecognised falls back to the first image, which
 * for most books is the cover anyway.
 */
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

void run(workerData as CoverRequest).then(response => parentPort?.postMessage(response));
