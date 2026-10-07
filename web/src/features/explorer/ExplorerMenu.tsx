import type { MouseEvent } from 'react';
import type { FileEntry } from '@hearth/shared';

import { folderActions, type EntryAction, type FolderHandlers } from './actions';
import { ContextMenu } from './ContextMenu';

export interface MenuState {
  /** None: the folder's own menu, opened on empty space. */
  entries: FileEntry[];
  x: number;
  y: number;
}

/** The right-click menu: for the items it was opened on, or for the folder itself. */
export function ExplorerMenu({
  menu,
  folder,
  canWriteHere,
  folderHandlers,
  entryActions,
  onClose,
}: {
  menu: MenuState;
  folder: string;
  canWriteHere: boolean;
  folderHandlers: FolderHandlers;
  entryActions: (entries: FileEntry[]) => EntryAction[];
  onClose: () => void;
}) {
  const onFolder = menu.entries.length === 0;
  return (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      title={menuTitle(menu.entries, folder)}
      actions={onFolder ? folderActions(canWriteHere, folderHandlers) : entryActions(menu.entries)}
      onClose={onClose}
    />
  );
}

/** The menu's heading: the folder's name on empty space, else what it acts on. */
function menuTitle(entries: FileEntry[], folder: string): string {
  if (entries.length === 0) return (folder.split('/').at(-1) ?? '') || 'This folder';
  return entries.length === 1 ? entries[0]!.name : `${entries.length} items`;
}

/**
 * Anywhere that is not an item or a control is empty space: the gaps between
 * tiles and the end of a row count, not just below the last one. A click
 * there clears the selection; a right click opens the folder's own menu.
 */
export function emptySpaceHandlers(
  clear: () => void,
  openFolderMenu: (x: number, y: number) => void,
) {
  return {
    onClick: (event: MouseEvent) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isEmptySpace(event.target)) clear();
    },
    onContextMenu: (event: MouseEvent) => {
      if (event.defaultPrevented || !isEmptySpace(event.target)) return;
      event.preventDefault();
      clear();
      openFolderMenu(event.clientX, event.clientY);
    },
  };
}

/** Not an item, a button, a link or a field: a click there means "nothing". */
function isEmptySpace(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !target.closest('[data-entry], button, a, input, label, [role="columnheader"]')
  );
}
