import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { type Density, type FileEntry, type Progress } from '@hearth/shared';

import { cn } from '@/lib/cn';
import { formatSize } from '@/lib/format';
import { useGridColumns } from './useGridColumns';
import { useRovingDomFocus } from './useRovingDomFocus';
import { Cover } from './Cover';

/**
 * The gap between tiles follows the density setting, so "compact" tightens the
 * grid the way it tightens the list. Read from CSS rather than duplicated here,
 * for the same reason the row height is.
 */
const DEFAULT_GAP_PX = 10;

/**
 * Space under the cover in the comfortable grid: two lines of name plus the
 * kind or size. Fixed in pixels rather than derived from tile width, because a
 * wider tile fits a longer name on the same two lines — and the virtualiser
 * places rows at exactly the height it is told, so an estimate that grows with
 * the content spills one tile into the next.
 */
const CAPTION_HEIGHT_PX = 56;

export function FileGrid({
  entries,
  selectedPaths,
  focusedIndex,
  tileSize,
  density,
  showFolderCovers,
  bottomInset,
  progressFor,
  tabIndexFor,
  onColumnsChange,
  onSelect,
  onOpen,
  onContextMenu,
  onKeyDown,
  peekHandlersFor,
  onBackgroundClick,
}: {
  entries: FileEntry[];
  selectedPaths: ReadonlySet<string>;
  focusedIndex: number;
  tileSize: number;
  /** Tightens the gap between tiles, the way it tightens list rows. */
  density: Density;
  /** Folder covers are opt-in and off by default. */
  showFolderCovers: boolean;
  /** Room to leave at the end of the grid for the floating selection bar. */
  bottomInset: number;
  progressFor: (path: string) => Progress | undefined;
  tabIndexFor: (index: number) => number;
  /** Reported upward so ↑↓ move by a row rather than by one item. */
  onColumnsChange: (columns: number) => void;
  onSelect: (index: number, modifiers: { ctrl?: boolean; shift?: boolean }) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (entry: FileEntry, index: number, event: React.MouseEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  /** Hover and long-press handlers that summon the Peek card. */
  peekHandlersFor: (entry: FileEntry, index: number) => Record<string, unknown>;
  /** Clicking empty space (not a tile) clears the selection. */
  onBackgroundClick: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /**
   * Density reaches the grid as the gap between tiles. Read back from CSS after
   * layout, from this component's own container — which carries `data-density`
   * from render, so the value is the one just painted.
   */
  const [gap, setGap] = useState(DEFAULT_GAP_PX);
  useLayoutEffect(() => {
    const measured = gapOf(scrollRef.current);
    setGap(current => (current === measured ? current : measured));
  }, [density]);

  const { columns, columnWidth, ref: measureRef } = useGridColumns(tileSize, gap);

  useEffect(() => onColumnsChange(columns), [columns, onColumnsChange]);

  /**
   * Rows are virtualised, not tiles: the grid is laid out a row at a time, so
   * one virtual item is `columns` entries. Without this, a folder of 1 590
   * images mounted 1 590 tiles and every arrow key re-rendered all of them —
   * measured at 45 ms median, 137 ms worst, against 17 ms for the list.
   */
  const rowCount = Math.ceil(entries.length / columns);

  /**
   * Compact puts the name inside the tile and drops the kind line, so a tile is
   * exactly its square cover. Comfortable keeps the caption underneath, where
   * there is room to say what the thing is as well as what it is called.
   */
  const isCompact = density === 'compact';
  // The track width, not `tileSize` — that is only the `minmax` floor, and
  // `1fr` stretches the track past it.
  const rowHeight = columnWidth + (isCompact ? 0 : CAPTION_HEIGHT_PX) + gap;

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
  });

  // Sizes are cached per row, so a changed estimate is not enough on its own.
  // Without this, switching to compact keeps the row height that still reserved
  // room for the caption compact no longer draws — a band of dead space under
  // every row.
  useEffect(() => virtualizer.measure(), [rowHeight, virtualizer]);

  // Told explicitly, because the focused tile's row may not be mounted at all
  // after a jump to the end or a page down.
  useEffect(() => {
    if (focusedIndex >= 0 && columns > 0) {
      virtualizer.scrollToIndex(Math.floor(focusedIndex / columns), { align: 'auto' });
    }
  }, [columns, focusedIndex, virtualizer]);

  useRovingDomFocus(scrollRef, focusedIndex);

  return (
    <div
      ref={scrollRef}
      data-density={density}
      className="min-h-0 flex-1 overflow-auto p-3"
      // Room for the floating selection bar, so the last row of tiles can still
      // be clicked while the bar is up. A margin, not padding — see FileList.
      style={{ marginBottom: bottomInset || undefined }}
      // Focusable itself, so the keyboard has somewhere to live before any tile
      // has been focused — that is what makes the first arrow key work.
      tabIndex={-1}
      onClick={event => {
        if (!(event.target as HTMLElement).closest('[role="option"]')) onBackgroundClick();
      }}
      onKeyDown={onKeyDown}
    >
      {/* Measured separately from the scroll container so the column count comes
          from the actual track width rather than the padded viewport. */}
      <div ref={measureRef} role="listbox" aria-label="Files" aria-multiselectable>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map(row => {
            const start = row.index * columns;
            const rowEntries = entries.slice(start, start + columns);

            return (
              <div
                key={row.key}
                className="absolute inset-x-0 grid"
                style={{
                  height: row.size,
                  transform: `translateY(${row.start}px)`,
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  gap: `${gap}px`,
                }}
              >
                {rowEntries.map((entry, offset) => {
                  const index = start + offset;
                  const isSelected = selectedPaths.has(entry.path);
                  return (
                    <button
                      key={entry.path}
                      type="button"
                      role="option"
                      data-index={index}
                      aria-selected={isSelected}
                      tabIndex={tabIndexFor(index)}
                      onClick={event =>
                        onSelect(index, {
                          ctrl: event.ctrlKey || event.metaKey,
                          shift: event.shiftKey,
                        })
                      }
                      onDoubleClick={() => onOpen(entry)}
                      onContextMenu={event => onContextMenu(entry, index, event)}
                      {...peekHandlersFor(entry, index)}
                      className={cn(
                        'group block min-w-0 select-none rounded-density text-left',
                      )}
                    >
                      <Cover
                        entry={entry}
                        showFolderCover={showFolderCovers}
                        progress={progressFor(entry.path)}
                        isSelected={isSelected}
                        isFocused={index === focusedIndex}
                        labelInside={isCompact}
                      />

                      {isCompact ? null : (
                        /* Fixed height and clipped: the row is positioned at
                           exactly `rowHeight`, so a caption free to grow would
                           spill into the tile below it. */
                        <span
                          className="block overflow-hidden pt-1.5"
                          style={{ height: CAPTION_HEIGHT_PX }}
                        >
                          <span
                            className={cn(
                              'line-clamp-2 text-xs leading-snug',
                              isSelected ? 'font-medium text-accent' : 'text-primary',
                            )}
                            title={entry.name}
                          >
                            {entry.name}
                          </span>
                          <span className="tabular block truncate text-[0.6875rem] text-muted">
                            {entry.isDirectory ? 'Folder' : formatSize(entry.size)}
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** The live value of `--density-gap`, so the grid tightens with the list. */
function gapOf(element: HTMLElement | null): number {
  if (!element) return DEFAULT_GAP_PX;
  const raw = getComputedStyle(element).getPropertyValue('--density-gap');
  // The token is in rem; a gap is only ever a handful of pixels.
  const rem = Number.parseFloat(raw);
  return Number.isFinite(rem) ? Math.round(rem * 16) : DEFAULT_GAP_PX;
}
