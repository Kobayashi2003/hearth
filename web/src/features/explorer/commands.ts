import {
  CheckSquare,
  FolderInput,
  FolderPlus,
  FolderUp,
  LayoutGrid,
  List,
  LogOut,
  Moon,
  RefreshCw,
  Search as SearchIcon,
  Settings,
  SunMedium,
  Upload,
} from 'lucide-react';
import type { Theme, ViewMode } from '@hearth/shared';

import type { Command } from './CommandPalette';

export interface CommandContext {
  canWrite: boolean;
  isGrid: boolean;
  theme: Theme;
  focusSearch: () => void;
  refresh: () => void;
  goUp: () => void;
  selectAll: () => void;
  setViewMode: (mode: ViewMode) => void;
  setTheme: (theme: Theme) => void;
  openSettings: () => void;
  signOut: () => void;
  newFolder: () => void;
  uploadFiles: () => void;
  uploadFolder: () => void;
}

/** What Ctrl + K offers; writing commands appear only to someone who can write. */
export function paletteCommands(context: CommandContext): Command[] {
  const { isGrid } = context;
  const list: Command[] = [
    {
      id: 'search',
      label: 'Search in this folder',
      icon: SearchIcon,
      shortcut: '/',
      run: context.focusSearch,
    },
    {
      id: 'refresh',
      label: 'Refresh',
      icon: RefreshCw,
      shortcut: 'F5',
      run: context.refresh,
    },
    {
      id: 'up',
      label: 'Go up one folder',
      icon: FolderUp,
      shortcut: 'Alt+↑',
      run: context.goUp,
    },
    {
      id: 'select-all',
      label: 'Select everything',
      icon: CheckSquare,
      shortcut: 'Ctrl+A',
      run: context.selectAll,
    },
    {
      id: 'view',
      label: isGrid ? 'Show as list' : 'Show as covers',
      icon: isGrid ? List : LayoutGrid,
      run: () => context.setViewMode(isGrid ? 'list' : 'grid'),
    },
    {
      id: 'theme',
      label: 'Switch between light and dark',
      icon: document.documentElement.dataset.theme === 'dark' ? SunMedium : Moon,
      run: () => {
        const dark =
          context.theme === 'dark' ||
          (context.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        context.setTheme(dark ? 'light' : 'dark');
      },
    },
    { id: 'settings', label: 'Open settings', icon: Settings, run: context.openSettings },
    { id: 'sign-out', label: 'Sign out', icon: LogOut, run: context.signOut },
  ];
  if (context.canWrite) {
    list.splice(
      2,
      0,
      {
        id: 'new-folder',
        label: 'New folder',
        icon: FolderPlus,
        shortcut: 'Ctrl+Shift+N',
        run: context.newFolder,
      },
      {
        id: 'upload',
        label: 'Upload files',
        icon: Upload,
        shortcut: 'Ctrl+U',
        run: context.uploadFiles,
      },
      {
        id: 'upload-folder',
        label: 'Upload a folder',
        icon: FolderInput,
        run: context.uploadFolder,
      },
    );
  }
  return list;
}
