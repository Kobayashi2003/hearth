import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FileEntry } from '@hearth/shared';

import { api, mediaUrls } from '@/lib/api';
import { useKeyBindings } from '@/lib/keys';
import { isPreviewable } from '@/lib/file-kind';
import { useSession } from '@/features/session/session';
import { usePreferences } from '@/features/preferences/preferences';
import { useProgress } from '@/features/progress/progress';
import { usePreview } from '@/features/preview/PreviewProvider';
import { DOCK_CLEARANCE, DockSlot } from '@/features/shell/Dock';
import { useShell } from '@/features/shell/shell-context';
import { useUploads, type QueuedFile } from '@/features/transfer/uploads';
import { UploadTray } from '@/features/transfer/UploadTray';
import { useFileDrop, useUploadPickers } from '@/features/transfer/useFilePicking';
import { actionsFor } from './actions';
import { paletteCommands } from './commands';
import { CommandPalette } from './CommandPalette';
import { ExplorerDialogs, type DialogState } from './dialogs';
import { useEntryEvents } from './entryEvents';
import { ExplorerHeader } from './ExplorerHeader';
import { emptySpaceHandlers, ExplorerMenu, type MenuState } from './ExplorerMenu';
import { useRowHeight } from './FileList';
import { ListingBody } from './ListingBody';
import { SelectionBar } from './SelectionBar';
import { useRevealInFolder } from './search';
import { explorerShortcuts } from './shortcuts';
import { useLanding } from './useLanding';
import { useExplorer } from './useExplorer';
import { useFileOperations } from './useFileOperations';
import { useSelection } from './useSelection';

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
  const [menu, setMenu] = useState<MenuState | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const newFolder = useCallback(() => setDialog({ kind: 'new-folder' }), []);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [columns, setColumns] = useState(1);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const canWrite = can('write');
  const canDelete = can('delete');
  const rowHeight = useRowHeight(preferences.density);
  const isGrid = preferences.viewMode === 'grid';
  const step = isGrid ? columns : 1;

  const { data: trash } = useQuery({
    queryKey: ['trash-settings'],
    queryFn: () => api.trashSettings(),
    staleTime: 60_000,
    enabled: canDelete,
  });
  const operations = useFileOperations(search.path, selection.clear);

  // A selection belongs to the folder it was made in.
  useEffect(() => {
    selection.reset();
    setMenu(null);
    scrollRef.current?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.path, search.q, search.type, search.scope]);

  useLanding(explorer, selection, entries);

  const revealInFolder = useRevealInFolder();

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
      reveal: explorer.isSearching ? (entry: FileEntry) => revealInFolder(entry.path) : undefined,
    }),
    [open, operations, explorer.isSearching, revealInFolder],
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
  const pickers = useUploadPickers(startUpload);
  const drop = useFileDrop(canWrite, startUpload);

  const commands = useMemo(
    () =>
      paletteCommands({
        canWrite,
        isGrid,
        theme: preferences.theme,
        focusSearch: () => searchRef.current?.focus(),
        refresh: () => void explorer.refetch(),
        goUp: explorer.goUp,
        selectAll: selection.selectAll,
        setViewMode: mode => update('viewMode', mode),
        setTheme: theme => update('theme', theme),
        openSettings: shell.openSettings,
        signOut: () => void signOut(),
        newFolder,
        uploadFiles: pickers.pickFiles,
        uploadFolder: pickers.pickFolder,
      }),
    [
      explorer,
      selection.selectAll,
      isGrid,
      update,
      preferences.theme,
      shell.openSettings,
      signOut,
      canWrite,
      pickers.pickFiles,
      pickers.pickFolder,
      newFolder,
    ],
  );

  const blocked =
    preview.current !== null || dialog.kind !== 'none' || paletteOpen || menu !== null;

  useKeyBindings(
    explorerShortcuts({
      explorer,
      selection,
      operations,
      handlers,
      entries,
      step,
      isGrid,
      canWrite,
      canDelete,
      blocked,
      openPalette: () => setPaletteOpen(true),
      newFolder,
      upload: pickers.pickFiles,
      focusSearch: () => searchRef.current?.focus(),
    }),
  );

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
    <div className="relative flex min-h-0 flex-1 flex-col" {...drop.handlers}>
      <ExplorerHeader
        explorer={explorer}
        rootLabel={shell.rootLabel}
        viewMode={preferences.viewMode}
        canWrite={canWrite}
        onViewMode={mode => update('viewMode', mode)}
        onNewFolder={newFolder}
        onUploadFiles={pickers.pickFiles}
        onUploadFolder={pickers.pickFolder}
        onOpenNav={shell.openNav}
        searchRef={searchRef}
      />

      {explorer.isTruncated ? (
        <TruncatedNote shown={entries.length} total={explorer.total} />
      ) : null}

      <div
        ref={scrollRef}
        className="scroll-thin relative min-h-0 flex-1 overflow-auto border-t border-line"
        {...emptySpaceHandlers(selection.clear, (x, y) => setMenu({ entries: [], x, y }))}
      >
        <ListingBody
          explorer={explorer}
          listing={listing}
          isGrid={isGrid}
          tileSize={preferences.gridSize}
          canWrite={canWrite}
          scrollRef={scrollRef}
          onColumns={setColumns}
          onReveal={revealInFolder}
          onUpload={pickers.pickFiles}
          onNewFolder={newFolder}
        />
      </div>

      {drop.dropping ? <DropHint /> : null}

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
        <ExplorerMenu
          menu={menu}
          folder={search.path}
          canWriteHere={canWrite && !explorer.isSearching}
          folderHandlers={{
            newFolder,
            upload: pickers.pickFiles,
            paste: operations.clipboard ? operations.paste : null,
            selectAll: selection.selectAll,
            refresh: () => void explorer.refetch(),
          }}
          entryActions={targets => actionsFor(targets, permissions, handlers)}
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

      {pickers.inputs}
    </div>
  );
}

function TruncatedNote({ shown, total }: { shown: number; total: number }) {
  return (
    <p className="mx-4 mb-2 rounded-lg bg-glaze-wash px-3 py-1.5 text-[12.5px] text-ink-2 sm:mx-6">
      Showing the first {shown.toLocaleString()} of {total.toLocaleString()}. Search to narrow this
      folder down.
    </p>
  );
}

function DropHint() {
  return (
    <div className="animate-fade pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-3xl border-2 border-dashed border-glaze bg-glaze-wash">
      <p className="display-title text-[32px] text-glaze-strong">Drop to upload here</p>
    </div>
  );
}
