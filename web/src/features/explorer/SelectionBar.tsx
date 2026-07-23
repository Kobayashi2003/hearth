import { Copy, Download, Scissors, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { formatSize } from '@/lib/format';
import type { FileEntry } from '@hearth/shared';

/**
 * The contextual action bar for a selection. Anchored to the bottom centre so
 * it is within thumb reach on a phone and never covers the toolbar or the list
 * header — and, being floated, it does not reflow the list underneath it.
 */
export function SelectionBar({
  entries,
  clipboardCount,
  canWrite,
  canDelete,
  onCopy,
  onCut,
  onPaste,
  onDownload,
  onDelete,
  onClear,
}: {
  entries: FileEntry[];
  clipboardCount: number;
  canWrite: boolean;
  canDelete: boolean;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const hasSelection = entries.length > 0;
  if (!hasSelection && clipboardCount === 0) return null;

  const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
      <div
        className={cn(
          'pointer-events-auto flex max-w-full items-center gap-1 rounded-xl border border-subtle',
          'bg-overlay/95 px-1.5 py-1.5 shadow-lg backdrop-blur-md',
        )}
        // The bar is not part of the list, so a tap on it must not bubble out
        // to the background-clear handler and wipe the selection it acts on.
        onPointerDown={event => event.stopPropagation()}
      >
        {hasSelection ? (
          <div className="flex shrink-0 items-center gap-2 pl-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClear}
              aria-label="Clear selection"
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
            <span className="whitespace-nowrap text-[0.8125rem] font-medium text-primary">
              {entries.length} selected
              <span className="tabular ml-1.5 hidden font-normal text-muted sm:inline">
                {formatSize(totalSize)}
              </span>
            </span>
          </div>
        ) : null}

        {hasSelection ? (
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            <Action icon={Download} label="Download" onClick={onDownload} />
            {canWrite ? (
              <>
                <Action icon={Copy} label="Copy" onClick={onCopy} />
                <Action icon={Scissors} label="Cut" onClick={onCut} />
              </>
            ) : null}
            {canDelete ? (
              <Action icon={Trash2} label="Delete" onClick={onDelete} danger />
            ) : null}
          </div>
        ) : null}

        {clipboardCount > 0 && canWrite ? (
          <Button variant="primary" size="sm" onClick={onPaste} className="shrink-0">
            Paste {clipboardCount}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A selection action. The label sits beside the icon on a roomy screen and
 * collapses to icon-only on a phone, where the bar would otherwise overflow —
 * the `aria-label` keeps it named for assistive tech either way.
 */
function Action({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Download;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={[
        'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[0.8125rem]',
        'transition-colors duration-[--duration-instant] hover:bg-sunken',
        danger ? 'text-[--color-danger]' : 'text-secondary hover:text-primary',
      ].join(' ')}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
