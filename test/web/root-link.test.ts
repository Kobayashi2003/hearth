import { describe, expect, it } from 'vitest';
import type { RootDescriptor } from '@hearth/shared';

import { rootLinkOf } from '@/features/explorer/root-link';
import { validateExplorerSearch } from '@/features/explorer/search';

const roots: RootDescriptor[] = [
  { id: 'd0', label: 'D:\\', active: true, available: true },
  { id: 'e0', label: 'E:\\', active: false, available: false },
];

describe('which root a URL is in', () => {
  it('is the served root when the URL names it, or names none', () => {
    expect(rootLinkOf('d0', roots)).toEqual({ kind: 'here' });
    expect(rootLinkOf(undefined, roots)).toEqual({ kind: 'unnamed' });
  });

  it('is another root, still served or gone, when the URL names that', () => {
    expect(rootLinkOf('e0', roots)).toEqual({ kind: 'elsewhere', root: roots[1] });
    expect(rootLinkOf('gone', roots)).toEqual({ kind: 'elsewhere', root: null });
  });

  it('cannot be told before the roots load', () => {
    expect(rootLinkOf('e0', undefined)).toEqual({ kind: 'unknown' });
  });

  it('keeps the root named in the URL', () => {
    expect(validateExplorerSearch({ path: '同人', root: 'e0' })).toMatchObject({ root: 'e0' });
    expect(validateExplorerSearch({ path: '同人' })).not.toHaveProperty('root');
  });
});
