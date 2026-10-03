import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import AdmZip from 'adm-zip';
import { createExtractorFromData } from 'node-unrar-js';
import type { ArchiveEntry } from '@hearth/shared';

import {
  collator,
  isPage,
  RAR_EXTENSIONS,
  readArchiveFile,
  rethrow,
  zipEntryNames,
} from './comic-pages.js';

/** List an archive's members, or read exactly one. Both libraries are synchronous and whole-file, hence a worker. */

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
  content: Uint8Array;
  found: boolean;
  tooLarge: boolean;
  /** Password-protected; Hearth has no way to ask for the password. */
  encrypted: boolean;
}

export type ArchiveResponse = ArchiveListResponse | ArchiveReadResponse;

const empty = { kind: 'read', content: new Uint8Array() } as const;
const MISSING: ArchiveReadResponse = { ...empty, found: false, tooLarge: false, encrypted: false };
const TOO_LARGE: ArchiveReadResponse = { ...empty, found: true, tooLarge: true, encrypted: false };
const ENCRYPTED: ArchiveReadResponse = { ...empty, found: true, tooLarge: false, encrypted: true };

function byPlaceInTree(a: ArchiveEntry, b: ArchiveEntry): number {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
  return collator.compare(a.name, b.name);
}

/** Backslashes from Windows tools, and a leading `/` or `./` that would show as a nameless folder. */
function normaliseName(name: string): string {
  return name
    .replace(/\\/g, '/')
    .replace(/^(\.\/|\/)+/, '')
    .replace(/\/+$/, '');
}

function listZip(archivePath: string): ArchiveEntry[] {
  const entries = new AdmZip(archivePath).getEntries();
  const names = zipEntryNames(entries);
  return entries.map(entry => ({
    name: normaliseName(names.get(entry)!),
    size: entry.header.size,
    compressedSize: entry.header.compressedSize,
    isDirectory: entry.isDirectory,
    mtime: entry.header.time instanceof Date ? entry.header.time.getTime() : 0,
  }));
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

function readZipEntry(
  archivePath: string,
  entryName: string,
  maxBytes: number,
): ArchiveReadResponse {
  const entries = new AdmZip(archivePath).getEntries();
  const names = zipEntryNames(entries);
  const found = entries.find(
    entry => !entry.isDirectory && normaliseName(names.get(entry)!) === entryName,
  );

  if (!found) return MISSING;
  // Bit 0 of the general-purpose flags marks an encrypted entry.
  if ((found.header.flags & 1) === 1) return ENCRYPTED;
  if (found.header.size > maxBytes) {
    return TOO_LARGE;
  }
  return {
    kind: 'read',
    content: found.getData(),
    found: true,
    tooLarge: false,
    encrypted: false,
  };
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
  if (!header) return MISSING;
  if (header.flags.encrypted) return ENCRYPTED;
  if (header.unpSize > maxBytes) {
    return TOO_LARGE;
  }

  // Extract by the original (possibly backslashed) name, not the normalised one.
  const extracted = [...extractor.extract({ files: [header.name] }).files];
  const content = extracted[0]?.extraction;
  return {
    kind: 'read',
    content: content ?? new Uint8Array(),
    found: content !== undefined,
    tooLarge: false,
    encrypted: false,
  };
}

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
    .filter(entry => entry.name !== '' && !entry.name.startsWith('__MACOSX/'))
    .sort(byPlaceInTree);

  return {
    kind: 'list',
    entries: all.slice(0, request.limit),
    total: all.length,
    hasMore: all.length > request.limit,
    looksLikeComic: looksLikeComic(all),
  };
}

run(workerData as ArchiveRequest).then(response => parentPort?.postMessage(response), rethrow);
