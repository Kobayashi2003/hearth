import { useMemo, type RefObject } from 'react';
import {
  CheckCheck,
  ClipboardCopy,
  ClipboardPaste,
  Download,
  FolderPlus,
  FolderUp,
  Home,
  Info,
  Keyboard,
  LayoutGrid,
  Maximize,
  PencilLine,
  RefreshCw,
  Replace,
  Rows3,
  Scissors,
  Settings,
  SquareDashed,
  Trash2,
  Upload,
} from 'lucide-react';
import type { FileEntry } from '@hearth/shared';

import type { Preferences } from '@/features/hob/usePreferences';
import type { Command } from './commands';

export interface CommandContext {
  refresh: () => void;
  goUp: () => void;
  atRoot: boolean;
  openDirectory: (path: string) => void;
  selectAll: () => void;
  invert: () => void;
  clearSelection: () => void;
  selectedEntries: FileEntry[];
  canWrite: boolean;
  canDelete: boolean;
  clipboardHasItems: boolean;
  paste: () => void;
  copySelection: () => void;
  cutSelection: () => void;
  downloadSelection: () => void;
  openDialog: (dialog: 'newFolder' | 'rename' | 'delete' | 'details' | 'shortcuts' | 'settings') => void;
  filePickerRef: RefObject<HTMLInputElement | null>;
  folderPickerRef: RefObject<HTMLInputElement | null>;
  preferences: Preferences;
  updatePreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

/**
 * The one registry the command palette, the keyboard handler, and the shortcuts
 * dialog all read — so a shortcut cannot be bound but undocumented, or the
 * reverse. `isAvailable` gates both the palette entry and the shortcut.
 */
export function useExplorerCommands(context: CommandContext): Command[] {
  const {
    refresh, goUp, atRoot, openDirectory, selectAll, invert, clearSelection,
    selectedEntries, canWrite, canDelete, clipboardHasItems, paste, copySelection,
    cutSelection, downloadSelection, openDialog, filePickerRef, folderPickerRef,
    preferences, updatePreference,
  } = context;

  return useMemo<Command[]>(
    () => [
      { id: 'refresh', label: 'Refresh this folder', group: 'Navigate', icon: RefreshCw, shortcut: 'F5', run: refresh },
      { id: 'up', label: 'Go up one folder', group: 'Navigate', icon: FolderUp, shortcut: 'Alt+←', run: goUp, isAvailable: !atRoot },
      { id: 'home', label: 'Go to home folder', group: 'Navigate', icon: Home, shortcut: 'Alt+Home', run: () => openDirectory('') },

      { id: 'select-all', label: 'Select all', group: 'Selection', icon: CheckCheck, shortcut: 'Ctrl+A', run: selectAll },
      { id: 'invert', label: 'Invert selection', group: 'Selection', icon: Replace, run: invert },
      {
        id: 'clear',
        label: 'Clear selection',
        group: 'Selection',
        icon: SquareDashed,
        shortcut: 'Escape',
        run: clearSelection,
        // Inert with nothing selected, so Escape stays available to whatever
        // else might want it rather than being swallowed to no effect.
        isAvailable: selectedEntries.length > 0,
      },

      { id: 'new-folder', label: 'New folder', group: 'File', icon: FolderPlus, shortcut: 'Ctrl+Shift+N', run: () => openDialog('newFolder'), isAvailable: canWrite },
      { id: 'upload', label: 'Upload files', group: 'File', icon: Upload, shortcut: 'Ctrl+U', run: () => filePickerRef.current?.click(), isAvailable: canWrite },
      { id: 'upload-folder', label: 'Upload a folder', group: 'File', icon: Upload, run: () => folderPickerRef.current?.click(), isAvailable: canWrite },
      { id: 'download', label: 'Download selection', group: 'File', icon: Download, run: downloadSelection, isAvailable: selectedEntries.length > 0 },
      { id: 'copy', label: 'Copy', group: 'File', icon: ClipboardCopy, shortcut: 'Ctrl+C', run: copySelection, isAvailable: canWrite && selectedEntries.length > 0 },
      { id: 'cut', label: 'Cut', group: 'File', icon: Scissors, shortcut: 'Ctrl+X', run: cutSelection, isAvailable: canWrite && selectedEntries.length > 0 },
      { id: 'paste', label: 'Paste', group: 'File', icon: ClipboardPaste, shortcut: 'Ctrl+V', run: paste, isAvailable: canWrite && clipboardHasItems },
      { id: 'rename', label: 'Rename', group: 'File', icon: PencilLine, shortcut: 'F2', run: () => openDialog('rename'), isAvailable: canWrite && selectedEntries.length === 1 },
      { id: 'delete', label: 'Delete', group: 'File', icon: Trash2, shortcut: 'Delete', run: () => openDialog('delete'), isAvailable: canDelete && selectedEntries.length > 0 },
      {
        id: 'details',
        label: 'Show details',
        group: 'File',
        icon: Info,
        shortcut: 'Alt+Enter',
        run: () => openDialog('details'),
        isAvailable: selectedEntries.length === 1,
      },

      {
        id: 'view',
        // Named after where it goes, not after the pair it toggles between: a
        // palette is read as a list of destinations.
        label: preferences.viewMode === 'list' ? 'Show as a grid' : 'Show as a list',
        group: 'View',
        icon: preferences.viewMode === 'list' ? LayoutGrid : Rows3,
        run: () => updatePreference('viewMode', preferences.viewMode === 'list' ? 'grid' : 'list'),
      },
      {
        id: 'density',
        label: preferences.density === 'comfortable' ? 'Use compact rows' : 'Use comfortable rows',
        group: 'View',
        icon: Rows3,
        run: () =>
          updatePreference('density', preferences.density === 'comfortable' ? 'compact' : 'comfortable'),
      },
      { id: 'fullscreen', label: 'Toggle fullscreen', group: 'View', icon: Maximize, shortcut: 'F11', run: () => void toggleFullscreen() },

      { id: 'settings', label: 'Open settings', group: 'Application', icon: Settings, run: () => openDialog('settings') },
      { id: 'shortcuts', label: 'Keyboard shortcuts', group: 'Application', icon: Keyboard, shortcut: 'Ctrl+/', run: () => openDialog('shortcuts') },
    ],
    [
      refresh, goUp, atRoot, openDirectory, selectAll, invert, clearSelection,
      selectedEntries.length, canWrite, canDelete, clipboardHasItems, paste,
      copySelection, cutSelection, downloadSelection, openDialog, filePickerRef,
      folderPickerRef, preferences.viewMode, preferences.density, updatePreference,
    ],
  );
}

async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen().catch(() => undefined);
}
