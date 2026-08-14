import { Copy, Download, Info, Scissors, Trash2, X } from 'lucide-react';
import type { FileEntry } from '@hearth/shared';

import { Button } from '@/components/ui/Button';
import { TrayBar, useTrayIsShared } from '@/features/shell/BottomTray';
import { cn } from '@/lib/cn';
import { formatKind, formatSize, formatWhen } from '@/lib/format';

/**
 * The contextual action bar for a selection — a section of the shell's bottom
 * tray, which owns its surface and animates it in and out. Rendered whether or
 * not there is a selection, because the tray needs it present to show it leaving.
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
  onDetails,
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
  onDetails: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const hasSelection = entries.length > 0;
  const isVisible = hasSelection || clipboardCount > 0;
  const isShared = useTrayIsShared();

  const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
  // One file selected is the case where the bar can say something useful about
  // *this* file rather than count them.
  const only = entries.length === 1 ? entries[0] : undefined;

  return (
    <TrayBar slot="selection" show={isVisible}>
      <div
        className={cn('flex max-w-full items-center gap-1 px-1.5 py-1.5')}
        // The bar is not part of the list, so a tap on it must not bubble out
        // to the background-clear handler and wipe the selection it acts on.
        onPointerDown={event => event.stopPropagation()}
      >
        {hasSelection ? (
          <div className="flex min-w-0 shrink items-center gap-2 pl-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClear}
              aria-label="Clear selection"
              className="h-8 w-8 shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>

            {only ? (
              <>
                {/* Capped as a share of the window: a light novel's filename is a
                    title, a series, an imprint and a release code, and left to
                    grow it pushes every action off the bar. */}
                <span
                  className={cn(
                    'hidden min-w-0 max-w-[32vw] sm:block lg:max-w-[40vw]',
                    // Sharing the tray, the name goes first: it names the file
                    // you just picked, and the actions are what the bar is for.
                    isShared && 'sm:hidden xl:block',
                  )}
                >
                  <span
                    className="block truncate text-[0.8125rem] font-medium text-primary"
                    title={only.name}
                  >
                    {only.name}
                  </span>
                  {/* Only what the listing already knows; anything costing a
                      request lives in the details panel. */}
                  <span className="tabular block truncate text-[0.6875rem] text-muted">
                    {formatKind(only)}
                    {only.isDirectory ? '' : ` · ${formatSize(only.size)}`} ·{' '}
                    {formatWhen(only.mtime)}
                  </span>
                </span>

                <span
                  className={cn(
                    'whitespace-nowrap text-[0.8125rem] font-medium text-primary sm:hidden',
                    // The count stands in wherever the name is not shown.
                    isShared && 'sm:inline xl:hidden',
                  )}
                >
                  1 selected
                </span>
              </>
            ) : (
              <span className="whitespace-nowrap text-[0.8125rem] font-medium text-primary">
                {entries.length} selected
                <span className="tabular ml-1.5 hidden font-normal text-muted sm:inline">
                  {formatSize(totalSize)}
                </span>
              </span>
            )}
          </div>
        ) : null}

        {hasSelection ? (
          <div className="flex shrink-0 items-center gap-0.5">
            {only ? <Action icon={Info} label="Details" onClick={onDetails} /> : null}
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
    </TrayBar>
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
        'transition-colors duration-[var(--duration-instant)] hover:bg-sunken',
        danger ? 'text-[var(--color-danger)]' : 'text-secondary hover:text-primary',
      ].join(' ')}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
