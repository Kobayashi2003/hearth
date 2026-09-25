import { useEffect, useLayoutEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import { cn } from '@/lib/cn';
import { EntryVisual, ProgressBar } from './EntryVisual';
import type { ListingProps } from './FileList';

const GAP = 14;
const PADDING = 24;
/** Tiles are book-shaped: most of what earns a cover here is comics, novels and albums. */
const ASPECT = 4 / 3;
const CAPTION = 44;

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
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [scrollRef]);

  // Rounded, so tiles stay within about half a step of the preferred size either way.
  const columns = Math.max(2, Math.round((width - PADDING * 2 + GAP) / (tileSize + GAP)));
  const tileWidth = width > 0 ? (width - PADDING * 2 - GAP * (columns - 1)) / columns : tileSize;
  const rowHeight = tileWidth * ASPECT + CAPTION + GAP;
  const rows = Math.ceil(entries.length / columns);

  useEffect(() => onColumns(columns), [columns, onColumns]);

  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
    paddingStart: PADDING,
    paddingEnd: bottomInset,
  });

  useEffect(() => virtualizer.measure(), [rowHeight, virtualizer]);
  useEffect(() => {
    if (focusedIndex >= 0)
      virtualizer.scrollToIndex(Math.floor(focusedIndex / columns), { align: 'auto' });
  }, [focusedIndex, columns, virtualizer]);

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
            left: PADDING,
            right: PADDING,
            gap: GAP,
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
