// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FileEntry } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';
import { isInArchive, memberPath, splitMemberPath } from '@/lib/archive-path';
import { useInnerLayers } from '@/features/preview/inner-layers';

const file = (path: string): FileEntry => ({
  name: path.split('/').pop()!,
  path,
  size: 1,
  mtime: '2026-01-01T00:00:00.000Z',
  mimeType: 'image/jpeg',
  isDirectory: false,
});

describe('a file inside an archive', () => {
  it('is named by the archive and its name inside, which requests split apart', () => {
    const path = memberPath('Comics/book.zip', '图/第1页.jpg');
    expect(isInArchive(path)).toBe(true);
    expect(isInArchive('Comics/book.zip')).toBe(false);
    expect(splitMemberPath(path)).toEqual({ archive: 'Comics/book.zip', member: '图/第1页.jpg' });

    const url = new URL(mediaUrls.raw(path), 'http://hearth.test');
    expect(url.searchParams.get('path')).toBe('Comics/book.zip');
    expect(url.searchParams.get('member')).toBe('图/第1页.jpg');
    expect(url.search).not.toContain('%00');
  });
});

describe('files opened over the preview', () => {
  const pages = ['a.jpg', 'b.jpg', 'c.jpg'].map(name => file(memberPath('book.zip', name)));

  it('opens one over another, steps through its gallery, and closes back', () => {
    const { result } = renderHook(() => useInnerLayers({ entry: file('book.zip') }));
    act(() => result.current.open(pages[0]!, pages));
    expect(result.current.top?.entry).toBe(pages[0]);

    act(() => result.current.stepTop(1));
    act(() => result.current.stepTop(1));
    act(() => result.current.stepTop(1));
    // Stops at the last rather than going round.
    expect(result.current.top?.entry).toBe(pages[2]);

    act(() => result.current.closeTop());
    expect(result.current.top).toBeNull();
  });

  it('starts with none when the preview moves to another file', () => {
    const { result, rerender } = renderHook(
      ({ opener }) => useInnerLayers({ entry: file(opener) }),
      {
        initialProps: { opener: 'book.zip' },
      },
    );
    act(() => result.current.open(pages[0]!, pages));
    rerender({ opener: 'other.zip' });
    expect(result.current.layers).toEqual([]);
  });
});
