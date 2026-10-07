import { useEffect, type RefObject } from 'react';
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
}) {
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
    paddingStart,
    paddingEnd: bottomInset,
  });

  useEffect(() => virtualizer.measure(), [rowHeight, virtualizer]);
  // Every move of the focus, even within a row: the list may have been scrolled away from it.
  useEffect(() => {
    if (focused >= 0) virtualizer.scrollToIndex(Math.floor(focused / perRow), { align: 'auto' });
  }, [focused, perRow, virtualizer]);

  return virtualizer;
}
