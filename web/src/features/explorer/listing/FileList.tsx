import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { Density, FileEntry, Progress, SortDirection, SortField } from '@hearth/shared';

import { cn } from '@/lib/cn';
import { formatKind, formatSize, formatWhen, parentPathOf } from '@/lib/format';
import { useRovingDomFocus } from './useRovingDomFocus';
import { FileGlyph } from '@/components/FileGlyph';

interface Column {
  key: SortField;
  label: string;
  /**
   * Header layout. `flex`, not `block`: the cell holds the label and the sort
   * arrow side by side, and as `block` "Modified ↑" wrapped onto a second line.
   */
  headClassName: string;
}

/** Size, kind and date are fixed-width so their columns line up down the page. */
const COLUMNS: Column[] = [
  { key: 'name', label: 'Name', headClassName: 'flex-1 min-w-0' },
  { key: 'size', label: 'Size', headClassName: 'w-24 shrink-0 justify-end hidden sm:flex' },
  { key: 'type', label: 'Kind', headClassName: 'w-24 shrink-0 hidden md:flex' },
  { key: 'mtime', label: 'Modified', headClassName: 'w-36 shrink-0 hidden lg:flex' },
];

export function FileList({
  entries,
  selectedPaths,
  focusedIndex,
  sort,
  direction,
  showContainingFolder,
  density,
  bottomInset,
  progressFor,
  tabIndexFor,
  onSort,
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
  sort: SortField;
  direction: SortDirection;
  /** Recursive search results are meaningless without their folder. */
  showContainingFolder: boolean;
  /** Which end of this device's allowed row-height range to sit at. */
  density: Density;
  /** Room to leave at the end of the list for the floating selection bar. */
  bottomInset: number;
  progressFor: (path: string) => Progress | undefined;
  tabIndexFor: (index: number) => number;
  onSort: (field: SortField) => void;
  onSelect: (index: number, modifiers: { ctrl?: boolean; shift?: boolean }) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (entry: FileEntry, index: number, event: React.MouseEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  /** Hover and long-press handlers that summon the Peek card. */
  peekHandlersFor: (entry: FileEntry, index: number) => Record<string, unknown>;
  /** Clicking empty space (not a row) clears the selection. */
  onBackgroundClick: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /**
   * The row height in effect right now, read back from CSS.
   *
   * CSS owns the number because only CSS can answer the other half of it — the
   * `pointer: coarse` floor. Read after layout from this component's own
   * container, which carries `data-density` from render, so the value is the one
   * just painted rather than the one from before the setting changed.
   */
  const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_HEIGHT);
  useLayoutEffect(() => {
    const measured = rowHeightOf(scrollRef.current);
    setRowHeight(current => (current === measured ? current : measured));
  }, [density]);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 16,
  });

  // Sizes are cached per index, so a changed estimate is not enough on its own.
  useEffect(() => virtualizer.measure(), [rowHeight, virtualizer]);

  // The virtualiser must be told to move, since the focused row may not be
  // rendered at all when the keyboard jumps a page or to the end.
  useEffect(() => {
    if (focusedIndex >= 0) virtualizer.scrollToIndex(focusedIndex, { align: 'auto' });
  }, [focusedIndex, virtualizer]);

  useRovingDomFocus(scrollRef, focusedIndex);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="row"
        className="flex shrink-0 items-center gap-3 border-b border-subtle px-3 py-1.5 text-xs"
      >
        {COLUMNS.map(column => (
          <button
            key={column.key}
            type="button"
            onClick={() => onSort(column.key)}
            aria-sort={sort === column.key ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
            className={cn(
              'flex items-center gap-1 whitespace-nowrap font-medium hover:text-primary',
              sort === column.key ? 'text-primary' : 'text-muted',
              column.headClassName,
            )}
          >
            <span className="truncate">{column.label}</span>
            {sort === column.key ? (
              direction === 'asc' ? (
                <ArrowUp className="h-3 w-3 shrink-0" />
              ) : (
                <ArrowDown className="h-3 w-3 shrink-0" />
              )
            ) : null}
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        data-density={density}
        className="min-h-0 flex-1 overflow-auto"
        // Room for the tray. A margin, not padding: it has to come off the
        // scroll *viewport*, since the virtualiser brings a row into view by
        // measuring `clientHeight` — with padding, End parked the last row under
        // the bar.
        style={{ marginBottom: bottomInset }}
        role="listbox"
        aria-label="Files"
        aria-multiselectable
        // Focusable itself, so the keyboard has somewhere to live before any row
        // has been focused — that is what makes the first arrow key work.
        tabIndex={-1}
        onKeyDown={onKeyDown}
        // A click that misses every row (empty space below the list) clears
        // the selection — the expected way to dismiss the action bar.
        onClick={event => {
          if (!(event.target as HTMLElement).closest('[role="option"]')) onBackgroundClick();
        }}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map(row => {
            const entry = entries[row.index]!;
            const isSelected = selectedPaths.has(entry.path);
            const isFocused = row.index === focusedIndex;
            const folder = parentPathOf(entry.path);
            const progress = progressFor(entry.path);

            return (
              <div
                key={entry.path}
                role="option"
                data-index={row.index}
                aria-selected={isSelected}
                tabIndex={tabIndexFor(row.index)}
                onClick={event =>
                  onSelect(row.index, {
                    ctrl: event.ctrlKey || event.metaKey,
                    shift: event.shiftKey,
                  })
                }
                onDoubleClick={() => onOpen(entry)}
                onContextMenu={event => onContextMenu(entry, row.index, event)}
                {...peekHandlersFor(entry, row.index)}
                className={cn(
                  'absolute inset-x-0 flex cursor-default select-none items-center gap-3 px-3',
                  // Background only, never the outline: `transition-colors`
                  // includes `outline-color`, which a row without an outline
                  // computes as `currentcolor` — so the focus ring animated from
                  // near-white and flashed every time it appeared.
                  'transition-[background-color,color] duration-[var(--duration-instant)]',
                  isSelected ? 'bg-accent-wash' : 'hover:bg-sunken',
                  // Focus is drawn inset and dashed so it reads as "the keyboard
                  // is here" rather than "this is selected" — Ctrl+↑↓ moves one
                  // without the other, and that has to be visible.
                  isFocused && 'outline outline-2 -outline-offset-2 outline-dashed outline-strong',
                )}
                style={{ height: row.size, transform: `translateY(${row.start}px)` }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <FileGlyph entry={entry} className="shrink-0 text-secondary" />
                  <div className="min-w-0">
                    <span
                      className={cn(
                        'block truncate text-[0.8125rem] leading-relaxed',
                        isSelected ? 'font-medium text-accent' : 'text-primary',
                      )}
                    >
                      {entry.name}
                    </span>
                    {showContainingFolder && folder ? (
                      <span className="block truncate font-mono text-[0.6875rem] leading-relaxed text-muted">
                        {folder}
                      </span>
                    ) : null}
                  </div>
                </div>

                {progress ? (
                  <span
                    className="hidden h-1 w-12 shrink-0 overflow-hidden rounded-full bg-strong sm:block"
                    title={`${progress.percent}% read`}
                  >
                    <span
                      className="block h-full bg-accent"
                      style={{ width: `${Math.max(3, progress.percent)}%` }}
                    />
                  </span>
                ) : null}

                <span className="tabular hidden w-24 text-right text-xs text-muted sm:block">
                  {entry.isDirectory ? '—' : formatSize(entry.size)}
                </span>
                <span className="hidden w-24 truncate text-xs text-muted md:block">
                  {formatKind(entry)}
                </span>
                <span className="tabular hidden w-36 text-xs text-muted lg:block">
                  {formatWhen(entry.mtime)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const DEFAULT_ROW_HEIGHT = 36;

/** The live value of `--row-height`, so virtualisation matches what CSS draws. */
function rowHeightOf(element: HTMLElement | null): number {
  if (!element) return DEFAULT_ROW_HEIGHT;
  const raw = getComputedStyle(element).getPropertyValue('--row-height');
  return Number.parseInt(raw, 10) || DEFAULT_ROW_HEIGHT;
}
