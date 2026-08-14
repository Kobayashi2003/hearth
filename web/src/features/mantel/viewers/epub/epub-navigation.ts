/**
 * Turning the page in books epub.js cannot paginate for itself.
 *
 * A pre-paginated book has one spine item per page and nothing to scroll within,
 * so epub.js compares scroll offsets that are always zero and a turn does nothing.
 * Moving by spine index is the honest model there: one section is one page.
 *
 * A mixed book — a novel with a fixed-layout cover — marks only those items, and
 * epub.js then switches layout mode mid-book, leaving the reflowable pages around
 * them mis-scaled. Clearing the markings makes the whole book reflow uniformly.
 */

export interface SpineNavItem {
  href?: string;
  index?: number;
  properties?: string[];
}

interface NavLocation {
  start?: { index?: number };
  end?: { index?: number };
}

export interface NavigableRendition {
  next: () => unknown;
  prev: () => unknown;
  display: (target?: string | number) => Promise<void>;
  currentLocation: () => NavLocation | undefined;
  book?: { spine?: { get: (target?: unknown) => SpineNavItem | null | undefined } };
}

const FIXED_PROPERTY_MARKERS = ['pre-paginated', 'page-spread'];

/** Strip per-item layout markings so every section renders the same way. */
export function flattenMixedLayout(items: SpineNavItem[]): void {
  for (const item of items) {
    if (!Array.isArray(item.properties)) continue;
    item.properties = item.properties.filter(
      property => !FIXED_PROPERTY_MARKERS.some(marker => property.includes(marker)),
    );
  }
}

/**
 * Replace a rendition's page turns with moves along the spine, falling back to
 * the original behaviour whenever the location cannot be read. With two pages
 * displayed the next is one past the further of them, hence not simply ±1.
 */
export function turnBySpine(rendition: NavigableRendition, items: SpineNavItem[]): void {
  const originalNext = rendition.next.bind(rendition);
  const originalPrev = rendition.prev.bind(rendition);

  const displayIndex = (index: number, fallback: () => unknown): unknown => {
    const item = rendition.book?.spine?.get(index);
    return item?.href ? rendition.display(item.href) : fallback();
  };

  rendition.next = () => {
    try {
      const location = rendition.currentLocation();
      if (location?.start?.index == null) return originalNext();
      const index = furthest(location) + 1;
      return index < items.length ? displayIndex(index, originalNext) : undefined;
    } catch {
      return originalNext();
    }
  };

  rendition.prev = () => {
    try {
      const location = rendition.currentLocation();
      if (location?.start?.index == null) return originalPrev();
      const index = nearest(location) - 1;
      return index >= 0 ? displayIndex(index, originalPrev) : undefined;
    } catch {
      return originalPrev();
    }
  };
}

function furthest(location: NavLocation): number {
  const start = location.start?.index ?? 0;
  const end = location.end?.index;
  return end == null ? start : Math.max(start, end);
}

function nearest(location: NavLocation): number {
  const start = location.start?.index ?? 0;
  const end = location.end?.index;
  return end == null ? start : Math.min(start, end);
}
