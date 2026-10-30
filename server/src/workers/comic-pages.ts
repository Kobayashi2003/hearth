import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import type AdmZip from 'adm-zip';
import type { IZipEntry } from 'adm-zip';
import { createExtractorFromData } from 'node-unrar-js';

import { decodeText, detectEncoding } from '../lib/charset.js';

/** Shared by the comic and cover workers so they never disagree about which entry is page one. */

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif']);

export const RAR_EXTENSIONS = new Set(['.rar', '.cbr']);

export const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function isPage(entryName: string): boolean {
  const base = path.basename(entryName);
  if (base.startsWith('.') || entryName.includes('__MACOSX/')) return false;
  return IMAGE_EXTENSIONS.has(path.extname(base).toLowerCase());
}

/**
 * The cover an EPUB declares, as a path inside the archive. Regexes rather than
 * an XML parser: the elements have a fixed shape. Hrefs are relative to the OPF,
 * and EPUB 2 and 3 declare the cover differently.
 */
export function coverHrefFrom(
  containerXml: string,
  readEntry: (name: string) => string | null,
): string | null {
  const opfPath = /<rootfile[^>]+full-path="([^"]+)"/i.exec(containerXml)?.[1];
  const opf = opfPath ? readEntry(opfPath) : null;
  if (!opfPath || !opf) return null;

  const href = declaredCover(opf);
  if (!href) return null;
  const base = path.posix.dirname(opfPath);
  const target = decodeURIComponent(href);
  return base === '.' ? target : path.posix.normalize(`${base}/${target}`);
}

/** The cover's href as the OPF writes it: EPUB 3 marks the item, EPUB 2 names its id in a meta. */
function declaredCover(opf: string): string | null {
  const byProperty = /<item[^>]+properties="[^"]*cover-image[^"]*"[^>]*>/i.exec(opf)?.[0];
  const propertyHref = hrefOf(byProperty);
  if (propertyHref) return propertyHref;

  const coverId = /<meta[^>]+name="cover"[^>]+content="([^"]+)"/i.exec(opf)?.[1];
  if (!coverId) return null;
  const escapedId = coverId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return hrefOf(new RegExp(`<item[^>]+id="${escapedId}"[^>]*>`, 'i').exec(opf)?.[0]);
}

function hrefOf(tag: string | undefined): string | null {
  return (tag && /href="([^"]+)"/i.exec(tag)?.[1]) || null;
}

type Size = { width: number; height: number };

/** Dimensions from the header alone (PNG, JPEG, WebP); anything else is unmeasurable. */
export function imageSize(buffer: Buffer): Size | null {
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) return jpegSize(buffer);
  if (buffer.length > 30 && buffer.toString('ascii', 8, 12) === 'WEBP') return webpSize(buffer);
  return null;
}

/** JPEG: walk the segments to the frame header. */
function jpegSize(buffer: Buffer): Size | null {
  let offset = 2;
  while (offset + 9 < buffer.length && buffer[offset] === 0xff) {
    const marker = buffer[offset + 1]!;
    // SOF0-SOF15, excluding the four that are not frame headers.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return null;
}

function webpSize(buffer: Buffer): Size | null {
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  }
  if (chunk === 'VP8 ') {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  return null;
}
/** Rethrown from a worker's promise so the parent sees an `error` event instead of a silent exit. */
export function rethrow(error: unknown): never {
  throw error;
}

/** General-purpose bit 11: the entry name is UTF-8. */
const UTF8_NAME_FLAG = 0x800;

/**
 * Entry names as the archive's author saw them. adm-zip decodes every name as
 * UTF-8, but a zip made on a Chinese or Japanese Windows stores unflagged names
 * in GBK or Shift_JIS. The encoding is detected once across all unflagged names
 * of the archive: one short name is ambiguous, a whole archive rarely is.
 */
export function zipEntryNames(entries: readonly IZipEntry[]): Map<IZipEntry, string> {
  const isUtf8 = (entry: IZipEntry) => (entry.header.flags & UTF8_NAME_FLAG) !== 0;
  const unicode = new Map(entries.map(entry => [entry, unicodePath(entry)]));
  // Only names with nothing better to go on are guessed at, and only they sway the guess.
  const legacy = entries.filter(entry => !isUtf8(entry) && unicode.get(entry) === null);
  const encoding =
    legacy.length > 0
      ? detectEncoding(
          Buffer.concat(legacy.flatMap(entry => [entry.rawEntryName, Buffer.from('/')])),
        )
      : 'utf8';
  return new Map(
    entries.map(entry => [
      entry,
      isUtf8(entry)
        ? entry.rawEntryName.toString('utf8')
        : (unicode.get(entry) ?? decodeText(entry.rawEntryName, encoding)),
    ]),
  );
}

/** Info-ZIP's Unicode Path extra field. */
const UNICODE_PATH_FIELD = 0x7075;

/**
 * The name in UTF-8 that many zip tools store beside the legacy one: exact,
 * where the legacy name has to be guessed at. It counts only while its CRC
 * matches the legacy name, which a tool renaming the entry would have changed.
 */
function unicodePath(entry: IZipEntry): string | null {
  const extra = entry.extra;
  for (let offset = 0; offset + 4 <= extra.length;) {
    const id = extra.readUInt16LE(offset);
    const size = extra.readUInt16LE(offset + 2);
    const body = extra.subarray(offset + 4, offset + 4 + size);
    // Version 1, then the CRC-32 of the legacy name, then the name itself.
    if (id === UNICODE_PATH_FIELD && body.length > 5 && body[0] === 1) {
      return body.readUInt32LE(1) === zlib.crc32(entry.rawEntryName)
        ? body.subarray(5).toString('utf8')
        : null;
    }
    offset += 4 + size;
  }
  return null;
}

/** A file's bytes as the standalone ArrayBuffer unrar wants (not a view into Node's pool). */
export function readArchiveFile(archivePath: string): ArrayBuffer {
  const file = fs.readFileSync(archivePath);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}

/** A zip's image pages in reading order, each with its decoded name. */
export function zipPages(zip: AdmZip): Array<{ entry: IZipEntry; name: string }> {
  const entries = zip.getEntries();
  const names = zipEntryNames(entries);
  return entries
    .filter(entry => !entry.isDirectory && isPage(names.get(entry)!))
    .map(entry => ({ entry, name: names.get(entry)! }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

/** A RAR opened in memory, and the names of its image pages in reading order. */
export async function openRarPages(archivePath: string) {
  const extractor = await createExtractorFromData({ data: readArchiveFile(archivePath) });
  const pages = [...extractor.getFileList().fileHeaders]
    .filter(header => !header.flags.directory && isPage(header.name))
    .map(header => header.name)
    .sort(collator.compare);
  return { extractor, pages };
}
