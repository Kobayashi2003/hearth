import { Copy, Download, Scissors, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { formatSize } from '@/lib/format';
import type { FileEntry } from '@hearth/shared';

/**
 * Appears as soon as anything is selected, replacing the previous build's
 * separate "selection mode". The count and total size are shown because the
 * next action is usually download or delete, and both depend on how much.
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
  if (entries.length === 0 && clipboardCount === 0) return null;

  const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);

  // Floated rather than placed in flow: pushing the list down would shift a row
  // out from under the cursor mid-double-click, so opening an item would miss.
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-full border border-subtle bg-overlay/95 px-3 py-1.5 shadow-lg backdrop-blur-md">
      {entries.length > 0 ? (
        <>
          <span className="text-[0.8125rem] font-medium text-primary">
            {entries.length} selected
            <span className="tabular ml-2 font-normal text-muted">{formatSize(totalSize)}</span>
          </span>

          <div className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onDownload}>
              <Download className="h-3.5 w-3.5" /> Download
            </Button>

            {canWrite ? (
              <>
                <Button variant="ghost" size="sm" onClick={onCopy}>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
                <Button variant="ghost" size="sm" onClick={onCut}>
                  <Scissors className="h-3.5 w-3.5" /> Cut
                </Button>
              </>
            ) : null}

            {canDelete ? (
              <Button variant="ghost" size="sm" onClick={onDelete} className="text-[--color-danger]">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            ) : null}
          </div>
        </>
      ) : null}

      {clipboardCount > 0 && canWrite ? (
        <Button variant="secondary" size="sm" onClick={onPaste} className="ml-auto">
          Paste {clipboardCount} item{clipboardCount === 1 ? '' : 's'} here
        </Button>
      ) : null}

      {entries.length > 0 ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={onClear}
          aria-label="Clear selection"
          className="h-7 w-7"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      </div>
    </div>
  );
}
