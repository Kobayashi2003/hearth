import { describe, expect, it } from 'vitest';

import { contentRangeHeader, parseRange } from '../../server/src/modules/kiln/range.js';

const SIZE = 1000;

describe('parseRange', () => {
  it('reports no range when the header is absent or malformed', () => {
    expect(parseRange(undefined, SIZE).kind).toBe('none');
    expect(parseRange('items=0-10', SIZE).kind).toBe('none');
    expect(parseRange('bytes=-', SIZE).kind).toBe('none');
  });

  it('parses a closed range', () => {
    expect(parseRange('bytes=100-199', SIZE)).toEqual({
      kind: 'satisfiable',
      range: { start: 100, end: 199 },
    });
  });

  it('parses an open-ended range', () => {
    expect(parseRange('bytes=900-', SIZE)).toEqual({
      kind: 'satisfiable',
      range: { start: 900, end: 999 },
    });
  });

  it('parses a suffix range', () => {
    expect(parseRange('bytes=-100', SIZE)).toEqual({
      kind: 'satisfiable',
      range: { start: 900, end: 999 },
    });
  });

  it('clamps an end beyond the entity size', () => {
    expect(parseRange('bytes=990-5000', SIZE)).toEqual({
      kind: 'satisfiable',
      range: { start: 990, end: 999 },
    });
  });

  it('clamps a suffix longer than the entity', () => {
    expect(parseRange('bytes=-5000', SIZE)).toEqual({
      kind: 'satisfiable',
      range: { start: 0, end: 999 },
    });
  });

  it.each(['bytes=1000-', 'bytes=2000-3000', 'bytes=500-100', 'bytes=-0'])(
    'rejects %s as unsatisfiable',
    header => {
      expect(parseRange(header, SIZE).kind).toBe('unsatisfiable');
    },
  );

  it('treats any range over an empty file as unsatisfiable', () => {
    expect(parseRange('bytes=0-10', 0).kind).toBe('unsatisfiable');
  });

  it('ignores multi-range requests rather than answering multipart', () => {
    expect(parseRange('bytes=0-99,200-299', SIZE).kind).toBe('none');
  });
});

describe('contentRangeHeader', () => {
  it('formats the range against the total size', () => {
    expect(contentRangeHeader({ start: 10, end: 19 }, SIZE)).toBe('bytes 10-19/1000');
  });
});
