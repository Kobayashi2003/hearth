import { useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { Density, FileEntry, Progress, SortDirection, SortField } from '@hearth/shared';

import { useCoarsePointer } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import { formatSize, formatWhen, parentOf } from '@/lib/format';
import { EntryVisual, ProgressBar } from './EntryVisual';

export interface ListingProps {
  entries: FileEntry[];
  selected: ReadonlySet<string>;
  focusedIndex: number;
  rowHeight: number;
  bottomInset: number;
  folderCovers: boolean;
  progressFor: (path: string) => Progress | undefined;
  eventsFor: (entry: FileEntry) => Record<string, unknown>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export const COLUMNS = 'grid-cols-[minmax(0,1fr)_5.5rem] md:grid-cols-[minmax(0,1fr)_9rem_6rem]';

export function FileList({
  entries,
  selected,
  focusedIndex,
  rowHeight,
  bottomInset,
  folderCovers,
  progressFor,
  eventsFor,
  scrollRef,
  sort,
  direction,
  onSort,
  showFolder,
  onReveal,
}: ListingProps & {
  sort: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
  showFolder: boolean;
  onReveal: (entry: FileEntry) => void;
}) {
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    paddingEnd: bottomInset,
  });

  useEffect(() => virtualizer.measure(), [rowHeight, virtualizer]);
  useEffect(() => {
    if (focusedIndex >= 0) virtualizer.scrollToIndex(focusedIndex, { align: 'auto' });
  }, [focusedIndex, virtualizer]);

  const thumbWidth = rowHeight > 40 ? 96 : 64;

  return (
    <div role="grid" aria-rowcount={entries.length} className="min-w-0">
      <div
        role="row"
        className={cn(
          'sticky top-0 z-10 grid h-8 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur sm:px-6',
          COLUMNS,
        )}
      >
        <SortHeader field="name" label="Name" sort={sort} direction={direction} onSort={onSort} />
        <SortHeader
          field="mtime"
          label="Modified"
          sort={sort}
          direction={direction}
          onSort={onSort}
          className="hidden md:flex"
        />
        <SortHeader
          field="size"
          label="Size"
          sort={sort}
          direction={direction}
          onSort={onSort}
          className="justify-end"
        />
      </div>
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(item => {
          const entry = entries[item.index]!;
          const isSelected = selected.has(entry.path);
          const progress = progressFor(entry.path);
          return (
            <div
              key={entry.path}
              role="row"
              aria-selected={isSelected}
              data-index={item.index}
              {...eventsFor(entry)}
              className={cn(
                'absolute inset-x-0 grid select-none items-center gap-3 px-4 sm:px-6',
                COLUMNS,
                isSelected ? 'bg-glaze-wash' : 'hover:bg-sunken/70',
                item.index === focusedIndex && 'shadow-[inset_2px_0_0_var(--glaze)]',
              )}
              style={{ top: item.start, height: rowHeight }}
            >
              <div role="gridcell" className="flex min-w-0 items-center gap-3">
                <EntryVisual
                  entry={entry}
                  width={thumbWidth}
                  folderCovers={folderCovers}
                  badge="list"
                  className="size-[calc(var(--row)-10px)] shrink-0 rounded-md"
                  iconClassName="size-[18px]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate" title={entry.name}>
                      {entry.name}
                    </span>
                    {showFolder ? (
                      <button
                        type="button"
                        title="Show in folder"
                        onClick={event => {
                          event.stopPropagation();
                          onReveal(entry);
                        }}
                        className="hidden truncate text-[12px] text-ink-3 hover:text-glaze-strong hover:underline sm:inline"
                      >
                        /{parentOf(entry.path)}
                      </button>
                    ) : null}
                  </div>
                  <ProgressBar progress={progress} className="mt-0.5 w-24" />
                </div>
              </div>
              <div
                role="gridcell"
                className="tabular hidden truncate text-[13px] text-ink-3 md:block"
              >
                {formatWhen(entry.mtime)}
              </div>
              <div role="gridcell" className="tabular text-right text-[13px] text-ink-3">
                {entry.isDirectory ? '' : formatSize(entry.size)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SortHeader({
  field,
  label,
  sort,
  direction,
  onSort,
  className,
}: {
  field: SortField;
  label: string;
  sort: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const active = sort === field;
  const Arrow = direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      role="columnheader"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => onSort(field)}
      className={cn(
        'flex items-center gap-1 text-[12px] font-medium text-ink-3 hover:text-ink',
        active && 'text-ink-2',
        className,
      )}
    >
      {label}
      {active ? <Arrow className="size-3" /> : null}
    </button>
  );
}

/** Must match `--row` in app.css: the virtualiser needs the number, the CSS the variable. */
export function useRowHeight(density: Density): number {
  const coarse = useCoarsePointer();
  if (coarse) return density === 'compact' ? 42 : 48;
  return density === 'compact' ? 30 : 36;
}
