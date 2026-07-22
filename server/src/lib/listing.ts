import path from 'node:path';

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type FileEntry,
  type Page,
  type SortDirection,
  type SortField,
} from '@hearth/shared';

/** Natural ordering, so "file10" sorts after "file9". */
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
    // Ties keep a deterministic order, otherwise pagination can repeat entries.
    return primary !== 0 ? sign * primary : collator.compare(a.name, b.name);
  });
}

export function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(limit)));
}

export function paginate<T>(items: T[], page: number | undefined, limit: number | undefined): Page<T> {
  const total = items.length;
  if (page === undefined) return { items, total, hasMore: false };

  const size = clampLimit(limit);
  const start = (Math.max(1, Math.trunc(page)) - 1) * size;
  const end = start + size;
  return { items: items.slice(start, end), total, hasMore: end < total };
}
