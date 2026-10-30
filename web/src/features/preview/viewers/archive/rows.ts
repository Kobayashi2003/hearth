import { Folder, Lock, type LucideIcon } from 'lucide-react';
import type { ArchiveEntry, ArchiveListing, FileEntry } from '@hearth/shared';

import { memberPath } from '@/lib/archive-path';
import { iconFor } from '@/lib/file-kind';

/** One line of an archive's listing: a member, or a folder implied by members' names. */
export interface Row {
  /** Its name within the folder shown, or its whole path while filtering. */
  name: string;
  /** Its whole name inside the archive. */
  path: string;
  isDirectory: boolean;
  size: number;
  encrypted: boolean;
  mimeType: string;
  /** Epoch ms, 0 when the archive did not record one. */
  mtime: number;
}

export const LOCKED = {
  title: 'This file is password-protected',
  body: 'Hearth cannot ask for the password. Download the archive and open it with the password.',
};

/** The direct children of `folder`, with implied directories filled in. */
export function childrenOf(entries: ArchiveEntry[], folder: string): Row[] {
  const prefix = folder ? `${folder}/` : '';
  const rows = new Map<string, Row>();
  for (const entry of entries) {
    if (!entry.name.startsWith(prefix) || entry.name === folder) continue;
    const rest = entry.name.slice(prefix.length);
    const cut = rest.indexOf('/');
    if (cut === -1) {
      rows.set(rest, { ...entry, name: rest, path: entry.name });
      continue;
    }
    const name = rest.slice(0, cut);
    if (!rows.has(name)) rows.set(name, folderRow(name, prefix + name));
  }
  return [...rows.values()].sort((a, b) =>
    a.isDirectory !== b.isDirectory
      ? Number(b.isDirectory) - Number(a.isDirectory)
      : a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

function folderRow(name: string, path: string): Row {
  return { name, path, isDirectory: true, size: 0, encrypted: false, mimeType: '', mtime: 0 };
}

/** How many items, and how many of them are behind a password. */
export function summaryOf(data: ArchiveListing): string {
  const locked = data.entries.filter(item => item.encrypted && !item.isDirectory).length;
  return [
    `${data.total.toLocaleString()} items`,
    locked ? `${locked.toLocaleString()} password-protected` : null,
    data.hasMore ? 'showing the first part' : null,
  ]
    .filter(Boolean)
    .join(', ');
}

export function iconOf(row: Row): LucideIcon {
  if (row.isDirectory) return Folder;
  if (row.encrypted) return Lock;
  return iconFor({ name: row.name, mimeType: row.mimeType, isDirectory: false });
}

/**
 * A file inside the archive as the viewers take any file: named by the
 * archive's path and its name inside (`memberPath`), which every request
 * splits back apart. Its date is its own when the archive recorded one.
 */
export function memberEntry(archive: FileEntry, row: Row): FileEntry {
  return {
    name: row.name.split('/').pop() ?? row.name,
    path: memberPath(archive.path, row.path),
    size: row.size,
    mtime: row.mtime ? new Date(row.mtime).toISOString() : archive.mtime,
    mimeType: row.mimeType,
    isDirectory: false,
  };
}

/** A picture that can be drawn small: one the server can open, not behind a password. */
export function hasPicture(row: Row): boolean {
  return !row.isDirectory && !row.encrypted && row.mimeType.startsWith('image/');
}
