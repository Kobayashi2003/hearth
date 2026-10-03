import { describe, expect, it } from 'vitest';
import { isHiddenSystemEntry } from '@hearth/shared';

describe('entries never shown', () => {
  it('hides Windows volume folders', () => {
    for (const name of ['$RECYCLE.BIN', 'System Volume Information']) {
      expect(isHiddenSystemEntry(name), name).toBe(true);
    }
  });

  it('hides what macOS and Windows leave beside files', () => {
    for (const name of ['._i008.mov', '._', '.DS_Store', '__MACOSX', 'Thumbs.db', 'desktop.ini']) {
      expect(isHiddenSystemEntry(name), name).toBe(true);
    }
  });

  it('keeps ordinary files, dotfiles and names that only look alike', () => {
    for (const name of [
      'i008.mov',
      '.gitignore',
      '_draft.txt',
      'thumbs.db.bak',
      'my desktop.ini notes',
    ]) {
      expect(isHiddenSystemEntry(name), name).toBe(false);
    }
  });
});
