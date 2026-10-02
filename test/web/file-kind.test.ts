import { describe, expect, it } from 'vitest';
import type { FileEntry } from '@hearth/shared';

import { galleryFor, viewerKindFor } from '@/lib/file-kind';
import { childLeadingTo, extensionOf, formatDuration, formatSize } from '@/lib/format';

const file = (name: string, mimeType: string): FileEntry => ({
  name,
  path: `dir/${name}`,
  size: 1,
  mtime: '2026-01-01T00:00:00.000Z',
  mimeType,
  isDirectory: false,
});

describe('viewerKindFor', () => {
  it('lets the extension win over an ambiguous MIME type', () => {
    expect(viewerKindFor(file('a.cbz', 'application/x-cbz'))).toBe('comic');
    expect(viewerKindFor(file('a.zip', 'application/zip'))).toBe('archive');
    expect(viewerKindFor(file('a.epub', 'application/epub+zip'))).toBe('epub');
    expect(viewerKindFor(file('a.azw3', 'application/octet-stream'))).toBe('epub');
    expect(viewerKindFor(file('a.mobi', 'application/x-mobipocket-ebook'))).toBe('epub');
    expect(viewerKindFor(file('a.psd', 'image/vnd.adobe.photoshop'))).toBe('image');
    expect(viewerKindFor(file('a.htm', 'text/html'))).toBe('html');
  });

  it('falls back to the MIME family', () => {
    expect(viewerKindFor(file('a.mkv', 'video/x-matroska'))).toBe('video');
    expect(viewerKindFor(file('a.flac', 'audio/flac'))).toBe('audio');
    expect(viewerKindFor(file('a.json', 'application/json'))).toBe('text');
    expect(viewerKindFor(file('a.bin', 'application/octet-stream'))).toBe('none');
  });

  it('never previews a folder', () => {
    expect(viewerKindFor({ name: 'x', mimeType: 'inode/directory', isDirectory: true })).toBe(
      'none',
    );
  });
});

describe('galleryFor', () => {
  it('keeps only siblings of the same kind, in listing order', () => {
    const entries = [
      file('1.jpg', 'image/jpeg'),
      file('a.txt', 'text/plain'),
      file('2.png', 'image/png'),
    ];
    expect(galleryFor(entries[2]!, entries).map(entry => entry.name)).toEqual(['1.jpg', '2.png']);
  });
});

describe('path helpers', () => {
  it('finds the folder that led down to a descendant', () => {
    expect(childLeadingTo('A/B', 'A/B/C/D')).toBe('A/B/C');
    expect(childLeadingTo('', 'A/B')).toBe('A');
    expect(childLeadingTo('A/B', 'A/B')).toBeNull();
    expect(childLeadingTo('A/B', 'A/Bee/C')).toBeNull();
  });

  it('reads extensions without mistaking dotfiles', () => {
    expect(extensionOf('Movie.MKV')).toBe('.mkv');
    expect(extensionOf('.env')).toBe('');
    expect(extensionOf('README')).toBe('');
  });

  it('formats sizes and durations', () => {
    expect(formatSize(0)).toBe('—');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});
