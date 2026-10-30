import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import AdmZip from 'adm-zip';
import { createExtractorFromData } from 'node-unrar-js';
import type { ArchiveEntry } from '@hearth/shared';

import { writeFileAtomicallySync } from '../lib/atomic-file.js';
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
  | { kind: 'read'; archivePath: string; entryName: string; maxBytes: number }
  | { kind: 'unpack'; archivePath: string; members: UnpackTarget[]; maxBytes: number };

/** A member to write out, and the file to write it to. */
export interface UnpackTarget {
  name: string;
  file: string;
}

/** A member as the worker sees it; the service adds what it needs no archive library for. */
export type ListedEntry = Omit<ArchiveEntry, 'mimeType'>;

export interface ArchiveListResponse {
  kind: 'list';
  entries: ListedEntry[];
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

export interface ArchiveUnpackResponse {
  kind: 'unpack';
  /** The names written; one missing, encrypted or too large is left out. */
  written: string[];
}

export type ArchiveResponse = ArchiveListResponse | ArchiveReadResponse | ArchiveUnpackResponse;

const empty = { kind: 'read', content: new Uint8Array() } as const;
const MISSING: ArchiveReadResponse = { ...empty, found: false, tooLarge: false, encrypted: false };
const TOO_LARGE: ArchiveReadResponse = { ...empty, found: true, tooLarge: true, encrypted: false };
const ENCRYPTED: ArchiveReadResponse = { ...empty, found: true, tooLarge: false, encrypted: true };

function byPlaceInTree(a: ListedEntry, b: ListedEntry): number {
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

function listZip(archivePath: string): ListedEntry[] {
  const entries = new AdmZip(archivePath).getEntries();
  const names = zipEntryNames(entries);
  return entries.map(entry => ({
    name: normaliseName(names.get(entry)!),
    size: entry.header.size,
    compressedSize: entry.header.compressedSize,
    isDirectory: entry.isDirectory,
    mtime: entry.header.time instanceof Date ? entry.header.time.getTime() : 0,
    encrypted: isEncrypted(entry),
  }));
}

async function listRar(archivePath: string): Promise<ListedEntry[]> {
  const extractor = await createExtractorFromData({ data: readArchiveFile(archivePath) });
  return [...extractor.getFileList().fileHeaders].map(header => ({
    name: normaliseName(header.name),
    size: header.unpSize,
    compressedSize: header.packSize,
    isDirectory: header.flags.directory,
    mtime: header.time ? new Date(header.time).getTime() || 0 : 0,
    encrypted: header.flags.encrypted,
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
  if (isEncrypted(found)) return ENCRYPTED;
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

/** Every file an image it can show: a page behind a password cannot be read. */
function looksLikeComic(entries: ListedEntry[]): boolean {
  const files = entries.filter(entry => !entry.isDirectory);
  return files.length > 0 && files.every(entry => isPage(entry.name) && !entry.encrypted);
}

/** Bit 0 of the general-purpose flags marks an encrypted entry, ZipCrypto or AES alike. */
function isEncrypted(entry: AdmZip.IZipEntry): boolean {
  return (entry.header.flags & 1) === 1;
}

/**
 * Many members in one reading of the archive, each straight to its file: the
 * libraries read a whole archive to open it, so one member at a time would
 * read it again for every one.
 */
function unpackZip(archivePath: string, members: UnpackTarget[], maxBytes: number): string[] {
  const entries = new AdmZip(archivePath).getEntries();
  const names = zipEntryNames(entries);
  const byName = new Map(entries.map(entry => [normaliseName(names.get(entry)!), entry]));
  return members.flatMap(({ name, file }) => {
    const entry = byName.get(name);
    if (!entry || entry.isDirectory || isEncrypted(entry) || entry.header.size > maxBytes)
      return [];
    writeFileAtomicallySync(file, entry.getData());
    return [name];
  });
}

async function unpackRar(
  archivePath: string,
  members: UnpackTarget[],
  maxBytes: number,
): Promise<string[]> {
  const extractor = await createExtractorFromData({ data: readArchiveFile(archivePath) });
  const wanted = new Map(members.map(target => [target.name, target.file]));
  const headers = [...extractor.getFileList().fileHeaders].filter(
    header =>
      wanted.has(normaliseName(header.name)) &&
      !header.flags.directory &&
      !header.flags.encrypted &&
      header.unpSize <= maxBytes,
  );
  const extracted = [...extractor.extract({ files: headers.map(header => header.name) }).files];
  return extracted.flatMap(({ fileHeader, extraction }) => {
    const name = normaliseName(fileHeader.name);
    if (!extraction) return [];
    writeFileAtomicallySync(wanted.get(name)!, extraction);
    return [name];
  });
}

async function run(request: ArchiveRequest): Promise<ArchiveResponse> {
  const isRar = RAR_EXTENSIONS.has(path.extname(request.archivePath).toLowerCase());

  if (request.kind === 'unpack') {
    const { archivePath, members, maxBytes } = request;
    const written = isRar
      ? await unpackRar(archivePath, members, maxBytes)
      : unpackZip(archivePath, members, maxBytes);
    return { kind: 'unpack', written };
  }

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
