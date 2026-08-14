import { describe, expect, it } from 'vitest';

import {
  findByInitial,
  nextTypeaheadTerm,
  TYPEAHEAD_RESET_MS,
} from '../../web/src/features/explorer/listing/useFocusModel.js';

/**
 * Type-ahead is the one part of the focus model with non-obvious rules —
 * wrapping past the end, and the convention that repeating a letter cycles
 * rather than searching for a doubled letter.
 */

const names = ['anime', 'books', 'sakura.mkv', 'scan.png', 'sunset.jpg', 'zebra.txt'];

describe('findByInitial', () => {
  it('finds the first match when nothing is focused', () => {
    expect(findByInitial(names, 'b', -1)).toBe(1);
  });

  it('searches forward from the focused item, not from the start', () => {
    expect(findByInitial(names, 's', 2)).toBe(3);
  });

  it('wraps past the end', () => {
    expect(findByInitial(names, 'a', 4)).toBe(0);
  });

  it('narrows as more letters are typed', () => {
    expect(findByInitial(names, 'su', -1)).toBe(4);
  });

  it('cycles through same-letter items when one letter is repeated', () => {
    // "sss" means "the next thing starting with s", not a file called "sss".
    expect(findByInitial(names, 'sss', 2)).toBe(3);
  });

  it('does not treat a genuinely repeated pair as cycling when other letters follow', () => {
    expect(findByInitial(['aardvark', 'zebra'], 'aa', -1)).toBe(0);
  });

  it('returns null when nothing matches', () => {
    expect(findByInitial(names, 'q', -1)).toBeNull();
  });

  it('returns null for an empty collection', () => {
    expect(findByInitial([], 'a', -1)).toBeNull();
  });

  it('can land back on the focused item when it is the only match', () => {
    expect(findByInitial(names, 'z', 5)).toBe(5);
  });
});

describe('nextTypeaheadTerm', () => {
  it('extends the term while typing quickly', () => {
    expect(nextTypeaheadTerm({ term: 's', at: 1000 }, 'u', 1200)).toBe('su');
  });

  it('starts over after a pause', () => {
    expect(nextTypeaheadTerm({ term: 'su', at: 1000 }, 'b', 1000 + TYPEAHEAD_RESET_MS + 1)).toBe('b');
  });

  it('starts over from a cold state', () => {
    expect(nextTypeaheadTerm({ term: '', at: 0 }, 'a', 50_000)).toBe('a');
  });
});
