import path from 'node:path';

import type { FileEntry, Page, SortDirection, SortField } from '@hearth/shared';

/**
 * Natural order compares the numbers in names by value ("Episode 2" before
 * "Episode 10"); plain order compares them character by character, which is
 * what Everything does.
 */
const COLLATORS = {
  natural: new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }),
  plain: new Intl.Collator(undefined, { sensitivity: 'base' }),
};

export interface SortOrder {
  field: SortField;
  direction: SortDirection;
  /** Natural order (the default) or plain. */
  natural?: boolean | undefined;
}

/**
 * Folder by folder, then the name: `A/x` before `A/B/y` before `A B/z`.
 * Comparing the whole path as one string would put `A B/z` first, a space
 * sorting before the slash.
 */
function comparePaths(collator: Intl.Collator, a: string, b: string): number {
  const left = a.split('/');
  const right = b.split('/');
  const folders = Math.min(left.length, right.length) - 1;
  for (let index = 0; index < folders; index += 1) {
    const order = collator.compare(left[index]!, right[index]!);
    if (order !== 0) return order;
  }
  // The shorter folder is the parent: its own items come before its subfolders'.
  return left.length - right.length || collator.compare(left.at(-1)!, right.at(-1)!);
}

function compareBy(field: SortField, collator: Intl.Collator, a: FileEntry, b: FileEntry): number {
  switch (field) {
    case 'name':
      return collator.compare(a.name, b.name);
    case 'size':
      return a.size - b.size;
    case 'mtime':
      return Date.parse(a.mtime) - Date.parse(b.mtime);
    case 'type':
      return collator.compare(path.extname(a.name), path.extname(b.name));
    case 'path':
      return comparePaths(collator, a.path, b.path);
  }
}

/** Directories always lead, regardless of field or direction. */
export function sortEntries(entries: FileEntry[], order: SortOrder): FileEntry[] {
  const sign = order.direction === 'asc' ? 1 : -1;
  const collator = order.natural === false ? COLLATORS.plain : COLLATORS.natural;
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    const primary = compareBy(order.field, collator, a, b);
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
