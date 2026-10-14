import { useEffect, useRef, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

/**
 * The rows of a listing, rendered only near the viewport. Measured again when
 * the row height changes, and scrolled to keep the keyboard focus in view.
 */
export function useListingRows({
  count,
  scrollRef,
  rowHeight,
  overscan,
  paddingStart = 0,
  bottomInset,
  focused,
  perRow = 1,
  landing = 0,
  scrollMargin = 0,
}: {
  count: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  rowHeight: number;
  overscan: number;
  paddingStart?: number;
  bottomInset: number;
  /** The focused item's index, or -1 when nothing has the keyboard focus. */
  focused: number;
  /** Items per row: a grid's columns. */
  perRow?: number;
  /** Changes when the focus lands somewhere (going up): that row is centred. */
  landing?: number;
  /**
   * Height of what sits above the rows inside the scroller (a sticky column
   * header): where the rows start, and what a row scrolled to the top must clear.
   */
  scrollMargin?: number;
}) {
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
    paddingStart,
    paddingEnd: bottomInset,
    scrollMargin,
    scrollPaddingStart: scrollMargin,
  });

  useEffect(() => virtualizer.measure(), [rowHeight, virtualizer]);
  // Every move of the focus, even within a row: the list may have been scrolled away from it.
  useEffect(() => {
    if (focused >= 0) virtualizer.scrollToIndex(Math.floor(focused / perRow), { align: 'auto' });
  }, [focused, perRow, virtualizer]);
  // After the effect above, so a landing is centred rather than edged into view; once each,
  // and only when its row is known.
  const centred = useRef(0);
  useEffect(() => {
    if (landing === centred.current || focused < 0) return;
    centred.current = landing;
    virtualizer.scrollToIndex(Math.floor(focused / perRow), { align: 'center' });
  }, [landing, focused, perRow, virtualizer]);

  return virtualizer;
}
