import { useMemo } from 'react';
import {
  Copy,
  Download,
  Eye,
  FolderOpen,
  Info,
  Pencil,
  Pin,
  PinOff,
  Scissors,
  Trash2,
} from 'lucide-react';
import type { FileEntry } from '@hearth/shared';

import { isPreviewable } from '@/features/mantel/viewerFor';

/**
 * Everything you can do to an entry, declared once.
 *
 * The right-click menu, the Peek card's action grid and the selection bar all
 * render this list, so a capability cannot exist in one place and be missing
 * from another — which is exactly what had happened: the touch long-press menu
 * had no Copy or Cut, because it was written separately.
 *
 * The same reasoning as `commands.ts`, applied to entries rather than to the
 * application.
 */

export interface EntryAction {
  id: string;
  label: string;
  icon: typeof Copy;
  run: () => void;
  isAvailable: boolean;
  isDestructive?: boolean;
  /** Shown with a filled state — currently only pinning. */
  isActive?: boolean;
}

export interface EntryActionHandlers {
  onOpen: () => void;
  onPreview: () => void;
  onDownload: () => void;
  onCopy: () => void;
  onCut: () => void;
  onRename: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onDetails: () => void;
}

export function useEntryActions({
  entry,
  selectionCount,
  canWrite,
  canDelete,
  isPinned,
  handlers,
}: {
  /** Undefined when nothing is being acted on — the list is then empty. */
  entry: FileEntry | undefined;
  selectionCount: number;
  canWrite: boolean;
  canDelete: boolean;
  isPinned: boolean;
  handlers: EntryActionHandlers;
}): EntryAction[] {
  return useMemo(() => {
    if (!entry) return [];
    const isMultiple = selectionCount > 1;

    return [
      {
        id: 'open',
        label: 'Open',
        icon: entry.isDirectory ? FolderOpen : Eye,
        run: handlers.onOpen,
        isAvailable: !isMultiple,
      },
      {
        id: 'preview',
        label: 'Preview',
        icon: Eye,
        run: handlers.onPreview,
        isAvailable: !isMultiple && isPreviewable(entry),
      },
      {
        id: 'pin',
        label: isPinned ? 'Unpin' : 'Pin',
        icon: isPinned ? PinOff : Pin,
        run: handlers.onTogglePin,
        isAvailable: !isMultiple,
        isActive: isPinned,
      },
      { id: 'download', label: 'Download', icon: Download, run: handlers.onDownload, isAvailable: true },
      {
        id: 'details',
        label: 'Details',
        icon: Info,
        run: handlers.onDetails,
        isAvailable: !isMultiple,
      },
      { id: 'copy', label: 'Copy', icon: Copy, run: handlers.onCopy, isAvailable: canWrite },
      { id: 'cut', label: 'Cut', icon: Scissors, run: handlers.onCut, isAvailable: canWrite },
      {
        id: 'rename',
        label: 'Rename',
        icon: Pencil,
        run: handlers.onRename,
        isAvailable: canWrite && !isMultiple,
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        run: handlers.onDelete,
        isAvailable: canDelete,
        isDestructive: true,
      },
    ].filter(action => action.isAvailable);
  }, [canDelete, canWrite, entry, handlers, isPinned, selectionCount]);
}
