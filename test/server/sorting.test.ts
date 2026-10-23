import { describe, expect, it } from 'vitest';
import type { FileEntry } from '@hearth/shared';

import { sortEntries, type SortOrder } from '../../server/src/lib/listing.js';

function file(path: string, isDirectory = false): FileEntry {
  return {
    name: path.split('/').at(-1)!,
    path,
    size: 0,
    mtime: '2026-01-01T00:00:00.000Z',
    mimeType: 'image/jpeg',
    isDirectory,
  };
}

const order = (entries: FileEntry[], sort: SortOrder) =>
  sortEntries(entries, sort).map(entry => entry.path);

describe('sorting by folder', () => {
  it('orders by the folder an item is in, not by its own name', () => {
    const items = [file('A/2.jpg'), file('B/0.jpg'), file('C/1.jpg')];
    expect(order(items, { field: 'name', direction: 'asc' })).toEqual([
      'B/0.jpg',
      'C/1.jpg',
      'A/2.jpg',
    ]);
    expect(order(items, { field: 'path', direction: 'asc' })).toEqual([
      'A/2.jpg',
      'B/0.jpg',
      'C/1.jpg',
    ]);
  });

  it('compares folder by folder, a parent before its subfolders', () => {
    const items = [file('A B/z.jpg'), file('A/B/y.jpg'), file('A/x.jpg'), file('A/w.jpg')];
    expect(order(items, { field: 'path', direction: 'asc' })).toEqual([
      'A/w.jpg',
      'A/x.jpg',
      'A/B/y.jpg',
      'A B/z.jpg',
    ]);
  });

  it('reverses the whole order when descending, folders still first', () => {
    const items = [file('A/1.jpg'), file('B/1.jpg'), file('B/sub', true)];
    expect(order(items, { field: 'path', direction: 'desc' })).toEqual([
      'B/sub',
      'B/1.jpg',
      'A/1.jpg',
    ]);
  });
});

describe('natural order', () => {
  const episodes = [file('Show/Episode 10.mkv'), file('Show/Episode 2.mkv')];

  it('compares numbers by value unless turned off', () => {
    expect(order(episodes, { field: 'name', direction: 'asc' })).toEqual([
      'Show/Episode 2.mkv',
      'Show/Episode 10.mkv',
    ]);
    expect(order(episodes, { field: 'name', direction: 'asc', natural: false })).toEqual([
      'Show/Episode 10.mkv',
      'Show/Episode 2.mkv',
    ]);
  });

  it('applies to folder names as well', () => {
    const items = [file('Vol 10/a.jpg'), file('Vol 9/a.jpg')];
    expect(order(items, { field: 'path', direction: 'asc' })[0]).toBe('Vol 9/a.jpg');
    expect(order(items, { field: 'path', direction: 'asc', natural: false })[0]).toBe(
      'Vol 10/a.jpg',
    );
  });
});
