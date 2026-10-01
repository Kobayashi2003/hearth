import {
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  FolderOpen,
  FolderPlus,
  Info,
  Pencil,
  RefreshCw,
  Scissors,
  SquareCheckBig,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import type { FileEntry } from '@hearth/shared';

import { isPreviewable } from '@/lib/file-kind';

export interface EntryAction {
  id: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  danger?: boolean;
  run: () => void;
}

export interface ActionHandlers {
  open: (entry: FileEntry) => void;
  download: (entries: FileEntry[]) => void;
  copy: (entries: FileEntry[]) => void;
  cut: (entries: FileEntry[]) => void;
  rename: (entry: FileEntry) => void;
  remove: (entries: FileEntry[]) => void;
  details: (entry: FileEntry) => void;
}

/** One declaration for the context menu, the long-press menu and the selection bar. */
export function actionsFor(
  targets: FileEntry[],
  permissions: { write: boolean; delete: boolean },
  handlers: ActionHandlers,
): EntryAction[] {
  const only = targets.length === 1 ? targets[0] : undefined;
  const actions: EntryAction[] = [];
  if (only) {
    actions.push({
      id: 'open',
      label: only.isDirectory ? 'Open' : isPreviewable(only) ? 'Preview' : 'Open',
      icon: only.isDirectory ? FolderOpen : Eye,
      shortcut: 'Enter',
      run: () => handlers.open(only),
    });
  }
  actions.push({
    id: 'download',
    label: 'Download',
    icon: Download,
    run: () => handlers.download(targets),
  });
  if (permissions.write) {
    actions.push({
      id: 'copy',
      label: 'Copy',
      icon: Copy,
      shortcut: 'Ctrl+C',
      run: () => handlers.copy(targets),
    });
    actions.push({
      id: 'cut',
      label: 'Cut',
      icon: Scissors,
      shortcut: 'Ctrl+X',
      run: () => handlers.cut(targets),
    });
  }
  if (only && permissions.write) {
    actions.push({
      id: 'rename',
      label: 'Rename',
      icon: Pencil,
      shortcut: 'F2',
      run: () => handlers.rename(only),
    });
  }
  if (only)
    actions.push({
      id: 'details',
      label: 'Details',
      icon: Info,
      shortcut: 'Alt+Enter',
      run: () => handlers.details(only),
    });
  if (permissions.delete) {
    actions.push({
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      shortcut: 'Del',
      danger: true,
      run: () => handlers.remove(targets),
    });
  }
  return actions;
}

export interface FolderHandlers {
  newFolder: () => void;
  upload: () => void;
  paste: (() => void) | null;
  selectAll: () => void;
  refresh: () => void;
}

/** The menu for the folder itself: a right-click (or long-press) on empty space. */
export function folderActions(canWrite: boolean, handlers: FolderHandlers): EntryAction[] {
  const actions: EntryAction[] = [];
  if (canWrite) {
    actions.push(
      {
        id: 'new-folder',
        label: 'New folder',
        icon: FolderPlus,
        shortcut: 'Ctrl+Shift+N',
        run: handlers.newFolder,
      },
      {
        id: 'upload',
        label: 'Upload files',
        icon: Upload,
        shortcut: 'Ctrl+U',
        run: handlers.upload,
      },
    );
    if (handlers.paste) {
      actions.push({
        id: 'paste',
        label: 'Paste',
        icon: ClipboardPaste,
        shortcut: 'Ctrl+V',
        run: handlers.paste,
      });
    }
  }
  actions.push(
    {
      id: 'select-all',
      label: 'Select all',
      icon: SquareCheckBig,
      shortcut: 'Ctrl+A',
      run: handlers.selectAll,
    },
    { id: 'refresh', label: 'Refresh', icon: RefreshCw, shortcut: 'F5', run: handlers.refresh },
  );
  return actions;
}
