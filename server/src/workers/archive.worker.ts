import fs from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import AdmZip from 'adm-zip';
import { createExtractorFromData } from 'node-unrar-js';
import type { ArchiveEntry } from '@hearth/shared';

import { collator, isPage, RAR_EXTENSIONS } from './comic-pages.js';

/**
 * Looking inside an archive without unpacking it.
 *
 * On a worker thread for the same reason the comic extractor is: both libraries
 * work on the whole file in memory and synchronously, so a 2 GB archive would
 * otherwise stall every other request for as long as it took to read.
 *
 * Two jobs, because they share all of that machinery: list the members, or hand
 * back the bytes of exactly one of them.
 */

export type ArchiveRequest =
  | { kind: 'list'; archivePath: string; limit: number }
  | { kind: 'read'; archivePath: string; entryName: string; maxBytes: number };

export interface ArchiveListResponse {
  kind: 'list';
  entries: ArchiveEntry[];
  total: number;
  hasMore: boolean;
  looksLikeComic: boolean;
}

export interface ArchiveReadResponse {
  kind: 'read';
  /** Empty when the member does not exist or is larger than `maxBytes`. */
  content: Uint8Array;
  found: boolean;
  tooLarge: boolean;
}

export type ArchiveResponse = ArchiveListResponse | ArchiveReadResponse;

/** Directories are listed before files, then natural order within each. */
function byPlaceInTree(a: ArchiveEntry, b: ArchiveEntry): number {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
  return collator.compare(a.name, b.name);
}

/** Archive members are written with either separator; the tree uses one. */
function normaliseName(name: string): string {
  return name.replace(/\\/g, '/').replace(/\/+$/, '');
}

function listZip(archivePath: string): ArchiveEntry[] {
  return new AdmZip(archivePath).getEntries().map(entry => ({
    name: normaliseName(entry.entryName),
    size: entry.header.size,
    compressedSize: entry.header.compressedSize,
    isDirectory: entry.isDirectory,
    mtime: entry.header.time instanceof Date ? entry.header.time.getTime() : 0,
  }));
}

function readArchiveFile(archivePath: string): ArrayBuffer {
  const file = fs.readFileSync(archivePath);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}

async function listRar(archivePath: string): Promise<ArchiveEntry[]> {
  const extractor = await createExtractorFromData({ data: readArchiveFile(archivePath) });
  return [...extractor.getFileList().fileHeaders].map(header => ({
    name: normaliseName(header.name),
    size: header.unpSize,
    compressedSize: header.packSize,
    isDirectory: header.flags.directory,
    mtime: header.time ? new Date(header.time).getTime() || 0 : 0,
  }));
}

function readZipEntry(archivePath: string, entryName: string, maxBytes: number): ArchiveReadResponse {
  const found = new AdmZip(archivePath)
    .getEntries()
    .find(entry => !entry.isDirectory && normaliseName(entry.entryName) === entryName);

  if (!found) return { kind: 'read', content: new Uint8Array(), found: false, tooLarge: false };
  if (found.header.size > maxBytes) {
    return { kind: 'read', content: new Uint8Array(), found: true, tooLarge: true };
  }
  return { kind: 'read', content: found.getData(), found: true, tooLarge: false };
}

async function readRarEntry(
  archivePath: string,
  entryName: string,
  maxBytes: number,
): Promise<ArchiveReadResponse> {
  const extractor = await createExtractorFromData({ data: readArchiveFile(archivePath) });

  const header = [...extractor.getFileList().fileHeaders].find(
    candidate => !candidate.flags.directory && normaliseName(candidate.name) === entryName,
  );
  if (!header) return { kind: 'read', content: new Uint8Array(), found: false, tooLarge: false };
  if (header.unpSize > maxBytes) {
    return { kind: 'read', content: new Uint8Array(), found: true, tooLarge: true };
  }

  // Asked for by its original name: `entryName` has been normalised, and rar
  // stores backslashes for archives made on Windows.
  const extracted = [...extractor.extract({ files: [header.name] }).files];
  const content = extracted[0]?.extraction;
  return {
    kind: 'read',
    content: content ?? new Uint8Array(),
    found: content !== undefined,
    tooLarge: false,
  };
}

/** A folder of nothing but pictures is a comic, whatever it is called. */
function looksLikeComic(entries: ArchiveEntry[]): boolean {
  const files = entries.filter(entry => !entry.isDirectory);
  return files.length > 0 && files.every(entry => isPage(entry.name));
}

async function run(request: ArchiveRequest): Promise<ArchiveResponse> {
  const isRar = RAR_EXTENSIONS.has(path.extname(request.archivePath).toLowerCase());

  if (request.kind === 'read') {
    return isRar
      ? readRarEntry(request.archivePath, request.entryName, request.maxBytes)
      : readZipEntry(request.archivePath, request.entryName, request.maxBytes);
  }

  const all = (isRar ? await listRar(request.archivePath) : listZip(request.archivePath))
    // macOS resource forks are noise in every archive that has them.
    .filter(entry => entry.name !== '' && !entry.name.startsWith('__MACOSX/'))
    .sort(byPlaceInTree);

  return {
    kind: 'list',
    entries: all.slice(0, request.limit),
    total: all.length,
    hasMore: all.length > request.limit,
    // Computed over everything, not the page: whether this is a comic does not
    // depend on how much of it fitted in the listing.
    looksLikeComic: looksLikeComic(all),
  };
}

void run(workerData as ArchiveRequest).then(response => parentPort?.postMessage(response));
