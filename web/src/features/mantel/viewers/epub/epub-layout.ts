/**
 * Reading what an EPUB says about itself.
 *
 * These are the questions that have to be answered before the first page can be
 * drawn: which way does it read, is it a comic with fixed pages or a novel that
 * reflows, and should two pages sit side by side. Getting them wrong is not a
 * cosmetic problem — a right-to-left book paginated left-to-right turns
 * backwards, and a fixed-layout page reflowed as text comes out blank.
 *
 * Kept free of epub.js so the rules can be tested against plain objects; the
 * shapes below are the subset of its book object that is actually read.
 */

export interface TocEntry {
  label: string;
  href: string;
  depth: number;
}

export interface BookLayout {
  /** Any page in the book is pre-paginated. */
  fixed: boolean;
  /** The whole book is pre-paginated — a comic or a picture book. */
  globallyFixed: boolean;
  /** The spine says right-to-left: Japanese and Arabic books. */
  rtl: boolean;
}

export interface RawTocItem {
  label?: string;
  href?: string;
  subitems?: RawTocItem[];
}

export interface SpineItemLike {
  href?: string;
  index?: number;
  properties?: string[];
}

export interface BookLike {
  packaging?: {
    metadata?: { layout?: string; spread?: string; direction?: string; viewport?: string };
    spine?: { direction?: string };
  };
  spine?: {
    direction?: string;
    items?: SpineItemLike[];
    spineItems?: SpineItemLike[];
  };
}

const PRE_PAGINATED = 'pre-paginated';

function spineItemsOf(book: BookLike): SpineItemLike[] {
  return book.spine?.spineItems ?? book.spine?.items ?? [];
}

export function analyseLayout(book: BookLike): BookLayout {
  const metadata = book.packaging?.metadata;
  const globallyFixed = (metadata?.layout ?? 'reflowable') === PRE_PAGINATED;

  // A mixed book — a novel with a fixed-layout cover and colour plates — marks
  // only those items, so the whole spine has to be checked, not just metadata.
  const fixed =
    globallyFixed ||
    spineItemsOf(book).some(item =>
      item.properties?.some(property => property.includes(PRE_PAGINATED)),
    );

  const direction =
    book.spine?.direction ?? book.packaging?.spine?.direction ?? book.packaging?.metadata?.direction;

  return { fixed, globallyFixed, rtl: direction === 'rtl' };
}

/**
 * Two pages side by side, or one.
 *
 * The book's own `rendition:spread` wins where it is stated. Where it is not, a
 * comic gets a spread — its pages were drawn as spreads — and a novel does not,
 * because reflowed text in two narrow columns is worse than one wide one.
 */
export function resolveSpread(book: BookLike, globallyFixed: boolean): 'auto' | 'none' {
  const declared = (book.packaging?.metadata?.spread ?? '').trim().toLowerCase();
  if (declared === 'none') return 'none';
  if (declared === 'both' || declared === 'auto' || declared === 'landscape') return 'auto';
  return globallyFixed ? 'auto' : 'none';
}

/**
 * The shape of one page, as width ÷ height, or null if the book does not say.
 *
 * Only pre-paginated books declare it, in the form `width=720, height=1024`.
 * It is what lets a two-page spread be laid out so the pages meet at the spine:
 * without it the reading area is simply the window, each page is centred in its
 * half, and a comic opens as two pictures with a canyon between them.
 */
export function pageAspectOf(book: BookLike): number | null {
  return aspectFromViewport(book.packaging?.metadata?.viewport);
}

/** `width=720, height=1024` — the form used by both the OPF and a page's meta. */
export function aspectFromViewport(declared: string | null | undefined): number | null {
  if (!declared) return null;
  return ratioOf(
    Number(/width\s*=\s*(\d+(?:\.\d+)?)/.exec(declared)?.[1]),
    Number(/height\s*=\s*(\d+(?:\.\d+)?)/.exec(declared)?.[1]),
  );
}

/** `0 0 720 1024` — an SVG viewBox, which page-image books carry instead. */
export function aspectFromViewBox(declared: string | null | undefined): number | null {
  if (!declared) return null;
  const parts = declared.trim().split(/[\s,]+/).map(Number);
  return parts.length === 4 ? ratioOf(parts[2]!, parts[3]!) : null;
}

function ratioOf(width: number, height: number): number | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return width / height;
}

/** The nav document nests arbitrarily; depth is kept for indentation. */
export function flattenToc(items: RawTocItem[], depth = 0): TocEntry[] {
  return items.flatMap(entry => [
    { label: (entry.label ?? '').trim() || 'Untitled', href: entry.href ?? '', depth },
    ...flattenToc(entry.subitems ?? [], depth + 1),
  ]);
}

/**
 * Hrefs are compared without their fragment or leading slashes, because the
 * same file is written three ways across a single book: the spine says
 * `Text/p-001.xhtml`, the nav document says `../Text/p-001.xhtml#toc-1`, and a
 * link inside a chapter says `p-001.xhtml`.
 */
export function normaliseHref(href: string): string {
  return (href.split('#')[0] ?? '').replace(/^\.{0,2}\//, '').replace(/^\/+/, '');
}

/**
 * The chapter you are in, for the readout.
 *
 * Exact match first, then a suffix match for the relative-path case, and
 * finally the last chapter that began at or before the current spine position —
 * which is what a reader means by "which chapter is this" when the page sits
 * partway into one that the nav document names only at its start.
 */
export function chapterLabelFor(
  toc: TocEntry[],
  href: string | undefined,
  spineIndex: number | undefined,
  spine: SpineItemLike[],
): string {
  if (!href || toc.length === 0) return '';
  const current = normaliseHref(href);

  const exact = toc.find(entry => normaliseHref(entry.href) === current);
  if (exact) return exact.label;

  const partial = toc.find(entry => {
    const candidate = normaliseHref(entry.href);
    return candidate !== '' && (current.endsWith(candidate) || candidate.endsWith(current));
  });
  if (partial) return partial.label;

  if (spineIndex == null) return '';
  const indexByHref = new Map(
    spine
      .filter((item): item is SpineItemLike & { href: string } => typeof item.href === 'string')
      .map(item => [normaliseHref(item.href), item.index ?? 0]),
  );

  let best = -1;
  let label = '';
  for (const entry of toc) {
    const index = indexByHref.get(normaliseHref(entry.href));
    if (index != null && index <= spineIndex && index > best) {
      best = index;
      label = entry.label;
    }
  }
  return label;
}

/**
 * Which way a given arrow or edge turns the page.
 *
 * In a right-to-left book the next page is to the *left*, so the mapping from
 * "the reader pressed right" to "advance" inverts. Every navigation path —
 * keys, taps, swipes — goes through this so they cannot disagree with each
 * other, which is the usual way this ends up half-inverted.
 */
export function turnForSide(side: 'left' | 'right', rtl: boolean): 1 | -1 {
  const forward = side === 'right';
  return (forward !== rtl ? 1 : -1) as 1 | -1;
}
