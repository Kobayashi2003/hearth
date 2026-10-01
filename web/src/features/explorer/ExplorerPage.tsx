import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { FolderOpen, SearchX, TriangleAlert } from 'lucide-react';
import type { FileEntry } from '@hearth/shared';

import { api, mediaUrls } from '@/lib/api';
import { isPreviewable } from '@/lib/file-kind';
import { useSession } from '@/features/session/session';
import { usePreferences } from '@/features/preferences/preferences';
import { useProgress } from '@/features/progress/progress';
import { usePreview } from '@/features/preview/PreviewProvider';
import { isTypingTarget } from '@/features/preview/PreviewOverlay';
import { DOCK_CLEARANCE, DockSlot } from '@/features/shell/Dock';
import { useShell } from '@/features/shell/shell-context';
import {
  collectDropped,
  fromInput,
  useUploads,
  type QueuedFile,
} from '@/features/transfer/uploads';
import { UploadTray } from '@/features/transfer/UploadTray';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { actionsFor, folderActions } from './actions';
import { CommandPalette, type Command } from './CommandPalette';
import { ContextMenu } from './ContextMenu';
import { ExplorerDialogs, type DialogState } from './dialogs';
import { useEntryEvents } from './entryEvents';
import { ExplorerHeader } from './ExplorerHeader';
import { FileGrid } from './FileGrid';
import { FileList, useRowHeight } from './FileList';
import { ListingSkeleton } from './ListingSkeleton';
import { SelectionBar } from './SelectionBar';
import { useExplorer } from './useExplorer';
import { useFileOperations } from './useFileOperations';
import { useSelection } from './useSelection';

const PAGE_ROWS = 10;

export function ExplorerPage() {
  const explorer = useExplorer();
  const { search, entries } = explorer;
  const { can, signOut } = useSession();
  const { preferences, update } = usePreferences();
  const { progressFor } = useProgress();
  const preview = usePreview();
  const shell = useShell();
  const selection = useSelection(entries);
  const uploads = useUploads();

  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  // No entries means the folder's own menu, opened on empty space.
  const [menu, setMenu] = useState<{ entries: FileEntry[]; x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [columns, setColumns] = useState(1);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const filesInput = useRef<HTMLInputElement | null>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);

  const canWrite = can('write');
  const canDelete = can('delete');
  const rowHeight = useRowHeight(preferences.density);
  const isGrid = preferences.viewMode === 'grid';
  const step = isGrid ? columns : 1;

  const { data: trash } = useQuery({
    queryKey: ['trash-settings'],
    queryFn: () => api.trashSettings(),
    staleTime: 60_000,
  });
  const operations = useFileOperations(search.path, selection.clear);

  // A selection belongs to the folder it was made in.
  useEffect(() => {
    selection.reset();
    setMenu(null);
    scrollRef.current?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.path, search.q, search.type, search.scope]);

  // Back on a parent, the cursor lands on the folder just left.
  useEffect(() => {
    if (!explorer.returningTo || !entries.some(entry => entry.path === explorer.returningTo))
      return;
    selection.setFocused(explorer.returningTo);
    explorer.clearReturningTo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explorer.returningTo, entries]);

  const open = useCallback(
    (entry: FileEntry) => {
      if (entry.isDirectory) explorer.openFolder(entry.path);
      else if (isPreviewable(entry)) preview.open(entry, entries);
      else window.location.href = mediaUrls.download(entry.path);
    },
    [explorer, preview, entries],
  );

  const handlers = useMemo(
    () => ({
      open,
      download: operations.download,
      copy: operations.copy,
      cut: operations.cut,
      rename: (entry: FileEntry) => setDialog({ kind: 'rename', entry }),
      remove: (targets: FileEntry[]) => setDialog({ kind: 'delete', entries: targets }),
      details: (entry: FileEntry) => setDialog({ kind: 'details', entry }),
    }),
    [open, operations],
  );
  const permissions = { write: canWrite, delete: canDelete };
  const selectionActions = actionsFor(selection.selectedEntries, permissions, handlers);

  const eventsFor = useEntryEvents({
    onPick: (entry, modifiers) => selection.pick(entry.path, modifiers),
    onOpen: open,
    onMenu: (entry, x, y) => {
      // Right-clicking inside the selection acts on all of it; outside, on that one item.
      const targets = selection.selected.has(entry.path) ? selection.selectedEntries : [entry];
      if (!selection.selected.has(entry.path)) selection.pick(entry.path);
      setMenu({ entries: targets, x, y });
    },
    isSelecting: selection.selected.size > 0,
    isOnlySelected: entry => selection.selected.size === 1 && selection.selected.has(entry.path),
    onDeselect: selection.clear,
  });

  const startUpload = useCallback(
    (files: QueuedFile[]) => files.length > 0 && uploads.start(files, search.path),
    [uploads, search.path],
  );

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: 'search',
        label: 'Search in this folder',
        icon: SearchIcon,
        shortcut: '/',
        run: () => searchRef.current?.focus(),
      },
      {
        id: 'refresh',
        label: 'Refresh',
        icon: RefreshCw,
        shortcut: 'F5',
        run: () => void explorer.refetch(),
      },
      {
        id: 'up',
        label: 'Go up one folder',
        icon: FolderUp,
        shortcut: 'Alt+↑',
        run: explorer.goUp,
      },
      {
        id: 'select-all',
        label: 'Select everything',
        icon: CheckSquare,
        shortcut: 'Ctrl+A',
        run: selection.selectAll,
      },
      {
        id: 'view',
        label: isGrid ? 'Show as list' : 'Show as covers',
        icon: isGrid ? List : LayoutGrid,
        run: () => update('viewMode', isGrid ? 'list' : 'grid'),
      },
      {
        id: 'theme',
        label: 'Switch between light and dark',
        icon: document.documentElement.dataset.theme === 'dark' ? SunMedium : Moon,
        run: () => {
          const dark =
            preferences.theme === 'dark' ||
            (preferences.theme === 'system' &&
              window.matchMedia('(prefers-color-scheme: dark)').matches);
          update('theme', dark ? 'light' : 'dark');
        },
      },
      { id: 'settings', label: 'Open settings', icon: Settings, run: shell.openSettings },
      { id: 'sign-out', label: 'Sign out', icon: LogOut, run: () => void signOut() },
    ];
    if (canWrite) {
      list.splice(
        2,
        0,
        {
          id: 'new-folder',
          label: 'New folder',
          icon: FolderPlus,
          shortcut: 'Ctrl+Shift+N',
          run: () => setDialog({ kind: 'new-folder' }),
        },
        {
          id: 'upload',
          label: 'Upload files',
          icon: Upload,
          shortcut: 'Ctrl+U',
          run: () => filesInput.current?.click(),
        },
        {
          id: 'upload-folder',
          label: 'Upload a folder',
          icon: FolderInput,
          run: () => folderInput.current?.click(),
        },
      );
    }
    return list;
  }, [
    explorer,
    selection.selectAll,
    isGrid,
    update,
    preferences.theme,
    shell.openSettings,
    signOut,
    canWrite,
  ]);

  const blocked =
    preview.current !== null || dialog.kind !== 'none' || paletteOpen || menu !== null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const ctrl = event.ctrlKey || event.metaKey;
      const key = event.key;
      if (ctrl && key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (blocked || isTypingTarget(event.target) || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [data-radix-popper-content-wrapper]')) return;

      const selected = selection.selectedEntries;
      const focused = entries[selection.focusedIndex];
      const modifiers = { shift: event.shiftKey, ctrl };
      const run = (action: () => void) => {
        event.preventDefault();
        action();
      };

      if (key === 'ArrowDown') run(() => selection.move(step, modifiers));
      else if (key === 'ArrowUp' && event.altKey) run(explorer.goUp);
      else if (key === 'ArrowUp') run(() => selection.move(-step, modifiers));
      else if (key === 'ArrowRight' && isGrid) run(() => selection.move(1, modifiers));
      else if (key === 'ArrowLeft' && isGrid) run(() => selection.move(-1, modifiers));
      else if (key === 'PageDown') run(() => selection.move(PAGE_ROWS * step, modifiers));
      else if (key === 'PageUp') run(() => selection.move(-PAGE_ROWS * step, modifiers));
      else if (key === 'Home') run(() => selection.move('start', modifiers));
      else if (key === 'End') run(() => selection.move('end', modifiers));
      else if (key === 'Enter' && event.altKey && focused) run(() => handlers.details(focused));
      else if (key === 'Enter' && focused) run(() => open(focused));
      else if (key === 'Backspace') run(explorer.goUp);
      else if (key === 'Escape' && (selected.length > 0 || operations.clipboard))
        run(() => (selected.length > 0 ? selection.clear() : operations.clearClipboard()));
      else if (key === ' ' && focused) run(selection.toggleFocused);
      else if (key === 'F5') run(() => void explorer.refetch());
      else if (key === '/' || (ctrl && key.toLowerCase() === 'f'))
        run(() => searchRef.current?.focus());
      else if (ctrl && key.toLowerCase() === 'a') run(selection.selectAll);
      else if (ctrl && key.toLowerCase() === 'c' && canWrite && selected.length > 0)
        run(() => operations.copy(selected));
      else if (ctrl && key.toLowerCase() === 'x' && canWrite && selected.length > 0)
        run(() => operations.cut(selected));
      else if (ctrl && key.toLowerCase() === 'v' && canWrite && operations.clipboard)
        run(operations.paste);
      else if (ctrl && event.shiftKey && key.toLowerCase() === 'n' && canWrite)
        run(() => setDialog({ kind: 'new-folder' }));
      else if (ctrl && key.toLowerCase() === 'u' && canWrite)
        run(() => filesInput.current?.click());
      else if (key === 'Delete' && canDelete && selected.length > 0)
        run(() => handlers.remove(selected));
      else if (key === 'F2' && canWrite && selected.length === 1)
        run(() => handlers.rename(selected[0]!));
      else if (key.length === 1 && !ctrl && !event.altKey && key !== ' ')
        run(() => selection.typeTo(key));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    blocked,
    selection,
    entries,
    step,
    isGrid,
    explorer,
    handlers,
    open,
    operations,
    canWrite,
    canDelete,
  ]);

  const listing = {
    entries,
    selected: selection.selected,
    focusedIndex: selection.focusVisible ? selection.focusedIndex : -1,
    rowHeight,
    bottomInset: DOCK_CLEARANCE,
    folderCovers: preferences.folderCovers,
    progressFor,
    eventsFor,
    scrollRef,
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={event => {
        if (!canWrite || !event.dataTransfer.types.includes('Files')) return;
        dragDepth.current += 1;
        setDropping(true);
      }}
      onDragOver={event => canWrite && event.preventDefault()}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setDropping(false);
      }}
      onDrop={event => {
        if (!canWrite) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDropping(false);
        void collectDropped(event.dataTransfer).then(startUpload);
      }}
    >
      <ExplorerHeader
        explorer={explorer}
        rootLabel={shell.rootLabel}
        viewMode={preferences.viewMode}
        canWrite={canWrite}
        onViewMode={mode => update('viewMode', mode)}
        onNewFolder={() => setDialog({ kind: 'new-folder' })}
        onUploadFiles={() => filesInput.current?.click()}
        onUploadFolder={() => folderInput.current?.click()}
        onOpenNav={shell.openNav}
        searchRef={searchRef}
      />

      {explorer.isTruncated ? (
        <p className="mx-4 mb-2 rounded-lg bg-glaze-wash px-3 py-1.5 text-[12.5px] text-ink-2 sm:mx-6">
          Showing the first {entries.length.toLocaleString()} of {explorer.total.toLocaleString()}.
          Search to narrow this folder down.
        </p>
      ) : null}

      <div
        ref={scrollRef}
        className="scroll-thin relative min-h-0 flex-1 overflow-auto border-t border-line"
        // Anywhere that is not an item or a control is empty space: the gaps
        // between tiles and the end of a row count, not just below the last one.
        onClick={event => {
          if (event.ctrlKey || event.metaKey || event.shiftKey) return;
          if (!isEmptySpace(event.target)) return;
          selection.clear();
        }}
        onContextMenu={event => {
          if (event.defaultPrevented || !isEmptySpace(event.target)) return;
          event.preventDefault();
          selection.clear();
          setMenu({ entries: [], x: event.clientX, y: event.clientY });
        }}
      >
        {explorer.isPending ? (
          <ListingSkeleton
            view={isGrid ? 'grid' : 'list'}
            tileSize={preferences.gridSize}
            rowHeight={rowHeight}
            scrollRef={scrollRef}
          />
        ) : explorer.error ? (
          <Notice
            icon={<TriangleAlert />}
            title="This folder could not be opened"
            body={explorer.error.message}
            action={
              <Button variant="outline" onClick={() => void explorer.refetch()}>
                Try again
              </Button>
            }
          />
        ) : entries.length === 0 ? (
          explorer.isSearching ? (
            <Notice
              icon={<SearchX />}
              title="Nothing matches"
              body={
                !explorer.isRecursive
                  ? 'Try including subfolders too.'
                  : 'Try fewer or different words, or clear the type filter.'
              }
            />
          ) : (
            <Notice
              icon={<FolderOpen />}
              title="This folder is empty"
              body={canWrite ? 'Drop files here to upload them, or create a folder.' : undefined}
              action={
                canWrite ? (
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={() => filesInput.current?.click()}>
                      <Upload /> Upload files
                    </Button>
                    <Button variant="outline" onClick={() => setDialog({ kind: 'new-folder' })}>
                      <FolderPlus /> New folder
                    </Button>
                  </div>
                ) : undefined
              }
            />
          )
        ) : isGrid ? (
          <FileGrid {...listing} tileSize={preferences.gridSize} onColumns={setColumns} />
        ) : (
          <FileList
            {...listing}
            sort={search.sort}
            direction={search.direction}
            onSort={explorer.sortBy}
            showFolder={explorer.isSearching && explorer.isRecursive}
          />
        )}
      </div>

      {dropping ? (
        <div className="animate-fade pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-3xl border-2 border-dashed border-glaze bg-glaze-wash">
          <p className="display-title text-[32px] text-glaze-strong">Drop to upload here</p>
        </div>
      ) : null}

      <DockSlot slot="center">
        <SelectionBar
          entries={selection.selectedEntries}
          actions={selectionActions}
          clipboard={operations.clipboard}
          canPaste={canWrite && !explorer.isSearching}
          onPaste={operations.paste}
          onCancelClipboard={operations.clearClipboard}
          onClear={selection.clear}
        />
      </DockSlot>
      <DockSlot slot="right">
        <UploadTray jobs={uploads.jobs} onCancel={uploads.cancel} onClear={uploads.clearFinished} />
      </DockSlot>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          title={
            menu.entries.length === 0
              ? (search.path.split('/').at(-1) ?? '') || 'This folder'
              : menu.entries.length === 1
                ? menu.entries[0]!.name
                : `${menu.entries.length} items`
          }
          actions={
            menu.entries.length === 0
              ? folderActions(canWrite && !explorer.isSearching, {
                  newFolder: () => setDialog({ kind: 'new-folder' }),
                  upload: () => filesInput.current?.click(),
                  paste: operations.clipboard ? operations.paste : null,
                  selectAll: selection.selectAll,
                  refresh: () => void explorer.refetch(),
                })
              : actionsFor(menu.entries, permissions, handlers)
          }
          onClose={closeMenu}
        />
      ) : null}

      <ExplorerDialogs
        state={dialog}
        onClose={() => setDialog({ kind: 'none' })}
        currentPath={search.path}
        operations={operations}
        trashEnabled={trash?.enabled ?? true}
      />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />

      <input
        ref={filesInput}
        type="file"
        multiple
        hidden
        onChange={event => {
          startUpload(fromInput(event.target.files));
          event.target.value = '';
        }}
      />
      <input
        ref={folderInput}
        type="file"
        hidden
        {...{ webkitdirectory: '' }}
        onChange={event => {
          startUpload(fromInput(event.target.files));
          event.target.value = '';
        }}
      />
    </div>
  );
}

/** Not an item, a button, a link or a field: a click there means "nothing". */
function isEmptySpace(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !target.closest('[data-entry], button, a, input, label, [role="columnheader"]')
  );
}
