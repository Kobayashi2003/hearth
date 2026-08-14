import { describe, expect, it } from 'vitest';

import {
  analyseLayout,
  aspectFromViewBox,
  aspectFromViewport,
  chapterLabelFor,
  flattenToc,
  normaliseHref,
  resolveSpread,
  turnForSide,
  type BookLike,
} from '../../web/src/features/mantel/viewers/epub/epub-layout';

const reflowable: BookLike = {
  packaging: { metadata: { layout: 'reflowable' } },
  spine: { direction: 'ltr', items: [{ href: 'Text/ch1.xhtml', index: 0 }] },
};

describe('analyseLayout', () => {
  it('reads a plain novel as reflowable, left to right', () => {
    expect(analyseLayout(reflowable)).toEqual({ fixed: false, globallyFixed: false, rtl: false });
  });

  it('reads a comic as fixed throughout', () => {
    const comic: BookLike = {
      packaging: { metadata: { layout: 'pre-paginated' } },
      spine: { direction: 'rtl', items: [] },
    };
    expect(analyseLayout(comic)).toEqual({ fixed: true, globallyFixed: true, rtl: true });
  });

  it('spots a fixed page inside an otherwise reflowable book', () => {
    // A novel with a fixed-layout cover: metadata says reflowable and only the
    // one spine item is marked, so metadata alone would miss it.
    const mixed: BookLike = {
      packaging: { metadata: { layout: 'reflowable' } },
      spine: {
        items: [
          { href: 'cover.xhtml', properties: ['rendition:layout-pre-paginated'] },
          { href: 'ch1.xhtml' },
        ],
      },
    };
    const layout = analyseLayout(mixed);
    expect(layout.fixed).toBe(true);
    expect(layout.globallyFixed).toBe(false);
  });

  it('falls back to the packaging spine when the spine carries no direction', () => {
    expect(analyseLayout({ packaging: { spine: { direction: 'rtl' } }, spine: {} }).rtl).toBe(true);
  });

  it('survives a book with no spine at all', () => {
    expect(analyseLayout({})).toEqual({ fixed: false, globallyFixed: false, rtl: false });
  });
});

describe('resolveSpread', () => {
  it('obeys the book when it names a spread', () => {
    expect(resolveSpread({ packaging: { metadata: { spread: 'none' } } }, true)).toBe('none');
    expect(resolveSpread({ packaging: { metadata: { spread: 'Landscape' } } }, false)).toBe('auto');
  });

  it('spreads a comic and does not spread a novel when nothing is said', () => {
    expect(resolveSpread({}, true)).toBe('auto');
    expect(resolveSpread({}, false)).toBe('none');
  });
});

describe('page shape', () => {
  it('reads a declared viewport', () => {
    expect(aspectFromViewport('width=720, height=1024')).toBeCloseTo(720 / 1024);
    expect(aspectFromViewport('width=1200,height=1600')).toBeCloseTo(0.75);
  });

  it('reads an SVG viewBox, which is where most books actually say it', () => {
    expect(aspectFromViewBox('0 0 720 1024')).toBeCloseTo(720 / 1024);
    expect(aspectFromViewBox('0,0,800,600')).toBeCloseTo(4 / 3);
  });

  it('declines to guess from anything malformed', () => {
    // Books declare the field and leave it empty more often than they fill it.
    for (const value of ['', '   ', 'width=720', 'width=0, height=1024', undefined, null]) {
      expect(aspectFromViewport(value)).toBeNull();
    }
    for (const value of ['0 0 720', 'not a viewbox', '']) {
      expect(aspectFromViewBox(value)).toBeNull();
    }
  });
});

describe('normaliseHref', () => {
  it('drops the fragment and any leading relative prefix', () => {
    expect(normaliseHref('../Text/p-001.xhtml#toc-1')).toBe('Text/p-001.xhtml');
    expect(normaliseHref('/Text/p-001.xhtml')).toBe('Text/p-001.xhtml');
    expect(normaliseHref('./p-001.xhtml')).toBe('p-001.xhtml');
  });
});

describe('flattenToc', () => {
  it('keeps nesting as depth and names the unnamed', () => {
    expect(
      flattenToc([{ label: ' Part One ', href: 'a.xhtml', subitems: [{ href: 'b.xhtml' }] }]),
    ).toEqual([
      { label: 'Part One', href: 'a.xhtml', depth: 0 },
      { label: 'Untitled', href: 'b.xhtml', depth: 1 },
    ]);
  });
});

describe('chapterLabelFor', () => {
  const toc = flattenToc([
    { label: 'Cover', href: 'Text/cover.xhtml' },
    { label: 'Chapter One', href: '../Text/ch1.xhtml#start' },
  ]);
  const spine = [
    { href: 'Text/cover.xhtml', index: 0 },
    { href: 'Text/ch1.xhtml', index: 1 },
    { href: 'Text/ch1-b.xhtml', index: 2 },
  ];

  it('matches the same file written two different ways', () => {
    expect(chapterLabelFor(toc, 'Text/ch1.xhtml', 1, spine)).toBe('Chapter One');
  });

  it('falls back to the last chapter that began at or before this page', () => {
    // Nothing in the contents names ch1-b; it is the tail of Chapter One.
    expect(chapterLabelFor(toc, 'Text/ch1-b.xhtml', 2, spine)).toBe('Chapter One');
  });

  it('says nothing rather than guessing when there is no contents', () => {
    expect(chapterLabelFor([], 'Text/ch1.xhtml', 1, spine)).toBe('');
    expect(chapterLabelFor(toc, undefined, 1, spine)).toBe('');
  });
});

describe('turnForSide', () => {
  it('advances rightwards in a left-to-right book', () => {
    expect(turnForSide('right', false)).toBe(1);
    expect(turnForSide('left', false)).toBe(-1);
  });

  it('advances leftwards in a right-to-left book', () => {
    // The whole point: a Japanese book's next page is to the left, so every
    // arrow, tap zone and swipe has to invert together.
    expect(turnForSide('left', true)).toBe(1);
    expect(turnForSide('right', true)).toBe(-1);
  });
});
