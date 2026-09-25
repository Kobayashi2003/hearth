import { describe, expect, it } from 'vitest';

import {
  buildSearchExpression,
  everythingSortField,
  quoteTerm,
} from '../../server/src/adapters/everything/query.js';
import {
  parseEverythingResponse,
  parseSize,
  parseTimestamp,
} from '../../server/src/adapters/everything/parse.js';

describe('query escaping', () => {
  it('quotes a plain term', () => {
    expect(quoteTerm('holiday')).toBe('"holiday"');
  });

  it.each([
    ['a"b', '"ab"'],
    ['" | !<>', '" | !<>"'.replace('"', '"')],
  ])('strips the quote character from %s so a term cannot break out', input => {
    expect(quoteTerm(input).slice(1, -1)).not.toContain('"');
  });

  it('leaves operators inert because they sit inside quotes', () => {
    const expression = buildSearchExpression({
      scopeDirectory: 'C:\\media',
      text: 'a|b !c <d>',
    });
    // Every user term is individually quoted; nothing outside quotes came from input.
    const outsideQuotes = expression.replace(/"[^"]*"/g, '');
    expect(outsideQuotes).not.toContain('|');
    expect(outsideQuotes).not.toContain('!');
    expect(outsideQuotes).not.toContain('<');
  });

  it('scopes every query to a directory', () => {
    expect(buildSearchExpression({ scopeDirectory: 'C:\\media', text: 'x' })).toBe(
      'path:"C:\\media" "x"',
    );
  });

  it('ANDs multiple words rather than treating them as a phrase', () => {
    expect(buildSearchExpression({ scopeDirectory: 'R', text: 'cat dog' })).toBe(
      'path:"R" "cat" "dog"',
    );
  });

  it('pushes the extension filter down to Everything', () => {
    expect(
      buildSearchExpression({ scopeDirectory: 'R', text: '', extensions: ['jpg', 'png'] }),
    ).toBe('path:"R" ext:jpg;png');
  });

  it('maps mtime onto date_modified and type onto name', () => {
    expect(everythingSortField('mtime')).toBe('date_modified');
    expect(everythingSortField('type')).toBe('name');
  });
});

describe('timestamp parsing', () => {
  it('converts a Windows FILETIME', () => {
    // 2024-01-01T00:00:00Z as 100 ns ticks since 1601-01-01.
    expect(parseTimestamp('133485408000000000')).toBe(Date.UTC(2024, 0, 1));
  });

  it('accepts epoch milliseconds unchanged', () => {
    expect(parseTimestamp(1704067200000)).toBe(1704067200000);
  });

  it('accepts an ISO string', () => {
    expect(parseTimestamp('2024-01-01T00:00:00.000Z')).toBe(Date.UTC(2024, 0, 1));
  });

  it.each([null, undefined, '', 0, 'not-a-date'])('yields 0 for %s', raw => {
    expect(parseTimestamp(raw)).toBe(0);
  });
});

describe('size parsing', () => {
  it('accepts a numeric string', () => {
    expect(parseSize('4096')).toBe(4096);
  });

  it('accepts a number', () => {
    expect(parseSize(4096)).toBe(4096);
  });

  it.each([-1, '-1', '', null, undefined])('reports 0 for the folder marker %s', raw => {
    expect(parseSize(raw)).toBe(0);
  });
});

describe('response parsing', () => {
  it('joins the containing directory and the entry name', () => {
    const parsed = parseEverythingResponse({
      totalResults: 2,
      results: [
        { type: 'file', name: 'a.jpg', path: 'C:\\media\\pics', size: '10', date_modified: '0' },
        { type: 'folder', name: 'pics', path: 'C:\\media', size: '-1', date_modified: '0' },
      ],
    });

    expect(parsed.total).toBe(2);
    expect(parsed.results[0]).toEqual({
      absolutePath: 'C:\\media\\pics\\a.jpg',
      name: 'a.jpg',
      size: 10,
      mtimeMs: 0,
      isDirectory: false,
    });
    expect(parsed.results[1]!.isDirectory).toBe(true);
  });

  it('falls back to the row count when no total is reported', () => {
    const parsed = parseEverythingResponse({ results: [{ name: 'a', path: 'C:\\' }] });
    expect(parsed.total).toBe(1);
  });

  it('tolerates an empty or malformed body', () => {
    expect(parseEverythingResponse(null)).toEqual({ total: 0, results: [] });
    expect(parseEverythingResponse({ results: 'nope' })).toEqual({ total: 0, results: [] });
  });

  it('skips rows without a name rather than emitting a broken entry', () => {
    const parsed = parseEverythingResponse({
      results: [{ path: 'C:\\' }, { name: 'ok', path: 'C:\\' }],
    });
    expect(parsed.results).toHaveLength(1);
  });
});
