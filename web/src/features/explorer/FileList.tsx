import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { FileEntry, SortDirection, SortField } from '@hearth/shared';

import { cn } from '@/lib/cn';
import { formatKind, formatSize, formatWhen, parentPathOf } from '@/lib/format';
import type { Density } from '@/hooks/usePreferences';
import { FileGlyph } from './FileGlyph';

const ROW_HEIGHT: Record<Density, number> = { comfortable: 40, compact: 30 };

interface Column {
  key: SortField;
  label: string;
  className: string;
}

/** Size, kind and date are fixed-width so their columns line up down the page. */
const COLUMNS: Column[] = [
  { key: 'name', label: 'Name', className: 'flex-1 min-w-0' },
  { key: 'size', label: 'Size', className: 'w-24 text-right hidden sm:block' },
  { key: 'type', label: 'Kind', className: 'w-24 hidden md:block' },
  { key: 'mtime', label: 'Modified', className: 'w-36 hidden lg:block' },
];

export function FileList({
  entries,
  selected,
  density,
  sort,
  direction,
  showContainingFolder,
  onSort,
  onSelect,
  onOpen,
  onContextMenu,
}: {
  entries: FileEntry[];
  selected: ReadonlySet<string>;
  density: Density;
  sort: SortField;
  direction: SortDirection;
  /** Recursive search results are meaningless without their folder. */
  showContainingFolder: boolean;
  onSort: (field: SortField) => void;
  onSelect: (path: string, index: number, modifiers: { ctrl?: boolean; shift?: boolean }) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (entry: FileEntry, event: React.MouseEvent) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowHeight = ROW_HEIGHT[density];

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 16,
  });

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
              'flex items-center gap-1 font-medium hover:text-primary',
              sort === column.key ? 'text-primary' : 'text-muted',
              column.className,
              column.key === 'size' && 'justify-end',
            )}
          >
            {column.label}
            {sort === column.key ? (
              direction === 'asc' ? (
                <ArrowUp className="h-3 w-3" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              )
            ) : null}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" role="listbox" aria-label="Files">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map(row => {
            const entry = entries[row.index]!;
            const isSelected = selected.has(entry.path);
            const folder = parentPathOf(entry.path);

            return (
              <div
                key={entry.path}
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                onClick={event =>
                  onSelect(entry.path, row.index, {
                    ctrl: event.ctrlKey || event.metaKey,
                    shift: event.shiftKey,
                  })
                }
                onDoubleClick={() => onOpen(entry)}
                onContextMenu={event => onContextMenu(entry, event)}
                className={cn(
                  'absolute inset-x-0 flex cursor-default select-none items-center gap-3 px-3',
                  'transition-colors duration-[--duration-instant]',
                  isSelected ? 'bg-accent-wash' : 'hover:bg-sunken',
                )}
                style={{ height: row.size, transform: `translateY(${row.start}px)` }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <FileGlyph entry={entry} className="shrink-0 text-secondary" />
                  <div className="min-w-0">
                    <span className="block truncate text-[0.8125rem] text-primary">{entry.name}</span>
                    {showContainingFolder && folder ? (
                      <span className="block truncate font-mono text-[0.6875rem] text-muted">
                        {folder}
                      </span>
                    ) : null}
                  </div>
                </div>

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
