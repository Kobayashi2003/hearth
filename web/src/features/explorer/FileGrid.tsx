import { useEffect, useLayoutEffect, useState } from 'react';

import { cn } from '@/lib/cn';
import { EntryVisual, ProgressBar } from './EntryVisual';
import type { ListingProps } from './FileList';
import { useListingRows } from './useListingRows';

/** Gutters, wider on a desktop; a phone spends its width on the covers. */
const SPACING = { wide: { gap: 14, padding: 24 }, narrow: { gap: 8, padding: 12 } };
const NARROW_WIDTH = 640;
/**
 * The cover size is chosen on whatever screen the preference was set on; on a
 * phone the same setting gives three columns rather than two outsized ones.
 */
const NARROW_SCALE = 0.7;
/** Tiles are book-shaped: most of what earns a cover here is comics, novels and albums. */
export const ASPECT = 4 / 3;
const CAPTION = 44;

/** Columns and tile size for the scroll container's width; shared with the loading skeleton. */
export function useGridLayout(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  tileSize: number,
): { columns: number; tileWidth: number; rowHeight: number; gap: number; padding: number } {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [scrollRef]);

  const narrow = width > 0 && width < NARROW_WIDTH;
  const { gap, padding } = narrow ? SPACING.narrow : SPACING.wide;
  const preferred = narrow ? tileSize * NARROW_SCALE : tileSize;
  // Rounded, so tiles stay within about half a step of the preferred size either way.
  const columns = Math.max(2, Math.round((width - padding * 2 + gap) / (preferred + gap)));
  const tileWidth = width > 0 ? (width - padding * 2 - gap * (columns - 1)) / columns : preferred;
  return { columns, tileWidth, rowHeight: tileWidth * ASPECT + CAPTION + gap, gap, padding };
}

export function FileGrid({
  entries,
  selected,
  focusedIndex,
  bottomInset,
  folderCovers,
  progressFor,
  eventsFor,
  scrollRef,
  tileSize,
  onColumns,
}: ListingProps & { tileSize: number; onColumns: (columns: number) => void }) {
  const { columns, tileWidth, rowHeight, gap, padding } = useGridLayout(scrollRef, tileSize);
  const rows = Math.ceil(entries.length / columns);

  useEffect(() => onColumns(columns), [columns, onColumns]);

  const virtualizer = useListingRows({
    count: rows,
    scrollRef,
    rowHeight,
    overscan: 3,
    paddingStart: padding,
    bottomInset,
    focused: focusedIndex,
    perRow: columns,
  });

  const thumbWidth = tileWidth > 200 ? 480 : 320;

  return (
    <div
      role="grid"
      aria-rowcount={rows}
      className="relative"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map(row => (
        <div
          key={row.index}
          role="row"
          className="absolute grid"
          style={{
            top: row.start,
            left: padding,
            right: padding,
            gap,
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          }}
        >
          {entries
            .slice(row.index * columns, row.index * columns + columns)
            .map((entry, offset) => {
              const index = row.index * columns + offset;
              const isSelected = selected.has(entry.path);
              return (
                <div
                  key={entry.path}
                  role="gridcell"
                  aria-selected={isSelected}
                  {...eventsFor(entry)}
                  className="group min-w-0 select-none"
                >
                  <div
                    className={cn(
                      'relative isolate overflow-hidden rounded-xl bg-sunken ring-offset-2 ring-offset-bg transition-shadow',
                      isSelected && 'ring-2 ring-glaze',
                      index === focusedIndex && !isSelected && 'ring-2 ring-line',
                    )}
                    style={{ aspectRatio: `1 / ${ASPECT}` }}
                  >
                    <EntryVisual
                      entry={entry}
                      width={thumbWidth}
                      folderCovers={folderCovers}
                      badge="grid"
                      className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.02]"
                      iconClassName="size-10"
                    />
                    <ProgressBar
                      progress={progressFor(entry.path)}
                      className="absolute inset-x-2 bottom-2 rounded-full bg-black/30"
                    />
                  </div>
                  <p
                    className={cn(
                      'mt-1.5 line-clamp-2 text-[12.5px] leading-snug',
                      isSelected ? 'text-glaze-strong' : 'text-ink',
                    )}
                    title={entry.name}
                  >
                    {entry.name}
                  </p>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}
