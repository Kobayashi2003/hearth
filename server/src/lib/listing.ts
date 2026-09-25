import path from 'node:path';

import type { FileEntry, Page, SortDirection, SortField } from '@hearth/shared';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function compareBy(field: SortField, a: FileEntry, b: FileEntry): number {
  switch (field) {
    case 'name':
      return collator.compare(a.name, b.name);
    case 'size':
      return a.size - b.size;
    case 'mtime':
      return Date.parse(a.mtime) - Date.parse(b.mtime);
    case 'type':
      return collator.compare(path.extname(a.name), path.extname(b.name));
  }
}

/** Directories always lead, regardless of field or direction. */
export function sortEntries(
  entries: FileEntry[],
  field: SortField,
  direction: SortDirection,
): FileEntry[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    const primary = compareBy(field, a, b);
    return primary !== 0 ? sign * primary : collator.compare(a.name, b.name);
  });
}

/**
 * The page size actually used: what the client asked for, never more than the
 * configured cap (`Infinity` when unlimited). No limit means "everything the cap allows",
 * because a folder is delivered whole and virtualised by the client.
 */
export function pageSize(requested: number | undefined, cap: number): number {
  const wanted =
    requested === undefined ? Number.POSITIVE_INFINITY : Math.max(1, Math.trunc(requested));
  return Math.min(wanted, cap);
}

/** `hasMore` tells the client it holds a prefix, so it can say so instead of hiding the rest. */
export function paginate<T>(items: T[], page: number | undefined, size: number): Page<T> {
  const total = items.length;
  const index = Math.max(1, Math.trunc(page ?? 1)) - 1;
  if (!Number.isFinite(size))
    return index === 0 ? { items, total, hasMore: false } : { items: [], total, hasMore: false };
  const start = index * size;
  const end = start + size;
  return { items: items.slice(start, end), total, hasMore: end < total };
}
