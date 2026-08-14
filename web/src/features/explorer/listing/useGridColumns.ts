import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * How many columns the grid is actually rendering.
 *
 * Measured rather than derived from breakpoints: the grid uses
 * `repeat(auto-fill, minmax(…))`, so the column count depends on the container's
 * width and the current grid size, not on the viewport. Two-dimensional
 * keyboard navigation needs the real number — guessing it sends ↓ to the wrong
 * cell, which is precisely the disorientation the model exists to avoid.
 */
export function useGridColumns(minimumItemWidth: number, gap: number) {
  const [columns, setColumns] = useState(1);
  /**
   * What a track is actually this wide, not the `minmax` floor. `1fr` shares the
   * leftover space out, so a 160px minimum in a 1000px container is really 161px
   * — and anything sized from the cover (a square cover's height, say) has to
   * use the real number or it will be wrong by the remainder.
   */
  const [columnWidth, setColumnWidth] = useState(minimumItemWidth);
  const element = useRef<HTMLElement | null>(null);

  const measure = useCallback(
    (width: number) => {
      if (width <= 0) return;
      // Mirrors auto-fill: as many tracks of at least `minimumItemWidth` as fit,
      // counting the gap between each pair.
      const fitted = Math.max(1, Math.floor((width + gap) / (minimumItemWidth + gap)));
      setColumns(fitted);
      setColumnWidth((width - gap * (fitted - 1)) / fitted);
    },
    [gap, minimumItemWidth],
  );

  const ref = useCallback(
    (node: HTMLElement | null) => {
      element.current = node;
      if (node) measure(node.clientWidth);
    },
    [measure],
  );

  useEffect(() => {
    const node = element.current;
    if (!node) return;

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) measure(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure]);

  return { columns, columnWidth, ref };
}
