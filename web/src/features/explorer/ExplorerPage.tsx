import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { FileEntry } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';
import { useSession } from '@/features/auth/SessionProvider';
import { useShell } from '@/features/shell/AppShell';
import { useTrayInset } from '@/features/shell/BottomTray';
import { usePreview } from '@/features/mantel/PreviewProvider';
import { galleryFor, isPreviewable } from '@/features/mantel/viewerFor';
import { DropOverlay, UploadPanel } from '@/features/transfer/UploadPanel';
import { UploadInputs } from '@/features/transfer/UploadInputs';
import { useDropZone } from '@/features/transfer/useDropZone';
import { useUploads } from '@/features/transfer/useUploads';
import { ContinueRail } from './ContinueRail';
import { DetailsDialog } from './dialogs/DetailsDialog';
import { HoverPreview } from './peek/HoverPreview';
import { useHoverPreview } from './peek/useHoverPreview';
import { PeekCard } from './peek/PeekCard';
import { usePeek } from './peek/usePeek';
import { EntryContextMenu } from './EntryContextMenu';
import { ExplorerBody } from './ExplorerBody';
import { ExplorerModals, type OpenDialog } from './dialogs/ExplorerModals';
import { SelectionBar } from './SelectionBar';
import { Toolbar } from './toolbar/Toolbar';
import { isTypingTarget, matchCommand } from './commands/commands';
import { useExplorerCommands } from './commands/useExplorerCommands';
import { useEntryActions } from './useEntryActions';
import { useFileOperations } from './useFileOperations';
import { useExplorerFocus } from './listing/useExplorerFocus';
import { useExplorerState } from './useExplorerState';
import { useLedger } from '@/features/ledger/useLedger';

/**
 * Rows PageUp / PageDown travel. A fixed count rather than a measured one: the
 * key should move a predictable distance, and a measured page changes with the
 * window and with density, so the same keystroke would land somewhere different
 * each time.
 */
const PAGE_ROWS = 12;

/**
 * The explorer's orchestrator: wires the toolbar, listing, selection, uploads,
 * command registry, and modals together. Each of those lives in its own file;
 * this component holds only the shared state and the handlers that cross them.
 */
export function ExplorerPage() {
  const explorer = useExplorerState();
  const { can } = useSession();
  const { preferences, updatePreference } = useShell();
  const preview = usePreview();
  const queryClient = useQueryClient();

  const { ledger, progressFor, setPinned } = useLedger();
  /** Room the tray's floating bars need at the end of the listing. */
  const trayInset = useTrayInset();

  const openEntry = useCallback(
    (entry: FileEntry) => {
      if (entry.isDirectory) explorer.openDirectory(entry.path);
      else if (isPreviewable(entry)) preview.open(entry, galleryFor(entry, explorer.entries));
      else window.location.href = mediaUrls.download(entry.path);
    },
    [explorer, preview],
  );

  // The grid reports its real column count so ↑↓ move a row; a list is one wide.
  const [gridColumns, setGridColumns] = useState(1);
  const columns = preferences.viewMode === 'grid' ? gridColumns : 1;

  const selection = useExplorerFocus({
    entries: explorer.entries,
    columns,
    pageRows: PAGE_ROWS,
    onOpen: openEntry,
  });

  const peek = usePeek();
  const hoverPreview = useHoverPreview();
  const [dialog, setDialog] = useState<OpenDialog>('none');
  const [isPaletteOpen, setPaletteOpen] = useState(false);
  const [contextTarget, setContextTarget] = useState<{ entry: FileEntry; x: number; y: number } | null>(null);

  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const folderPickerRef = useRef<HTMLInputElement | null>(null);

  const canWrite = can('write');
  const canDelete = can('delete');

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['listing'] });
  }, [queryClient]);

  const uploads = useUploads(refresh);

  // Selection belongs to a directory; carrying it across a navigation would let a
  // later action apply to files the user can no longer see.
  //
  // The hover preview goes too. Its row unmounts from under the cursor on a
  // navigation, so `mouseleave` never arrives and the thumbnail would otherwise
  // hang there showing a file from the folder you just left.
  useEffect(() => {
    selection.clear();
    // The cursor goes with it: index 7 in the folder just left points at an
    // unrelated file here, and that is where the next arrow key would resume.
    selection.setFocused(-1);
    hoverPreview.close();
    peek.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explorer.search.path, explorer.search.q]);

  // Landing on an ancestor, put the cursor back on the folder just left, so
  // stepping out of a deep tree does not lose your place in every level of it.
  // Focus, not selection: it is where the keyboard resumes from, and it should
  // not raise the action bar over a folder nobody asked to operate on.
  useEffect(() => {
    if (explorer.returnedIndex < 0) return;
    selection.setFocused(explorer.returnedIndex);
    explorer.claimReturnedIndex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explorer.returnedIndex]);

  const operations = useFileOperations({
    selectedEntries: selection.selectedEntries,
    currentPath: explorer.search.path,
    refresh,
    clearSelection: selection.clear,
  });

  const startUpload = useCallback(
    (files: Array<{ file: File; relativePath: string }>) => {
      if (files.length > 0) void uploads.start(files, explorer.search.path);
    },
    [uploads, explorer.search.path],
  );

  // ── Commands and keyboard ────────────────────────────────────────────────────

  const commands = useExplorerCommands({
    refresh,
    goUp: explorer.goUp,
    atRoot: explorer.atRoot,
    openDirectory: explorer.openDirectory,
    selectAll: selection.selectAll,
    invert: selection.invert,
    clearSelection: selection.clear,
    selectedEntries: selection.selectedEntries,
    canWrite,
    canDelete,
    clipboardHasItems: operations.hasClipboard,
    paste: operations.paste,
    copySelection: operations.copy,
    cutSelection: operations.cut,
    downloadSelection: operations.download,
    openDialog: setDialog,
    filePickerRef,
    folderPickerRef,
    preferences,
    updatePreference,
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (isTypingTarget(event.target)) return;

      // Escape belongs to whatever is on top of the explorer — a preview, the
      // palette, a dialog. Only when nothing is does it fall through to here and
      // mean "drop the selection".
      if (event.key === 'Escape' && document.querySelector('[role="dialog"], [role="menu"]')) return;

      const command = matchCommand(commands, event);
      if (command) {
        event.preventDefault();
        command.run();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commands]);

  const dropZone = useDropZone(canWrite, startUpload);
  const selectedEntry = selection.selectedEntries[0];

  /**
   * One entry is "the subject" of the menus: whatever was right-clicked or
   * long-pressed. Both surfaces render the same action list built from it, so
   * neither can quietly offer less than the other.
   */
  const actionSubject = peek.target?.entry ?? contextTarget?.entry ?? selectedEntry;
  const actionSubjectIndex = peek.target?.index;

  const entryActions = useEntryActions({
    entry: actionSubject,
    selectionCount: selection.selectedEntries.length,
    canWrite,
    canDelete,
    isPinned: actionSubject ? (ledger?.pinned.includes(actionSubject.path) ?? false) : false,
    handlers: useMemo(
      () => ({
        onOpen: () => actionSubject && openEntry(actionSubject),
        onPreview: () =>
          actionSubject && preview.open(actionSubject, galleryFor(actionSubject, explorer.entries)),
        onDownload: operations.download,
        onCopy: operations.copy,
        onCut: operations.cut,
        // A dialog acts on the selection, so the subject has to become it first.
        onRename: () => {
          if (actionSubjectIndex !== undefined) selection.selectAt(actionSubjectIndex, {});
          setDialog('rename');
        },
        onDelete: () => {
          if (actionSubjectIndex !== undefined) selection.selectAt(actionSubjectIndex, {});
          setDialog('delete');
        },
        onDetails: () => setDialog('details'),
        onTogglePin: () => {
          if (!actionSubject) return;
          const pinned = ledger?.pinned.includes(actionSubject.path) ?? false;
          setPinned(actionSubject.path, !pinned);
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [actionSubject, actionSubjectIndex, ledger, operations],
    ),
  });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" {...dropZone.handlers}>
      <Toolbar
        path={explorer.search.path}
        query={explorer.search.q}
        recursive={explorer.search.recursive}
        typeFilter={explorer.search.type}
        viewMode={preferences.viewMode}
        density={preferences.density}
        isFetching={explorer.isFetching}
        canWrite={canWrite}
        onNavigate={explorer.openDirectory}
        onBack={() => window.history.back()}
        onForward={() => window.history.forward()}
        onUp={explorer.goUp}
        onRefresh={refresh}
        onQueryChange={q => explorer.patch({ q })}
        onRecursiveChange={recursive => explorer.patch({ recursive })}
        onTypeFilterChange={type => explorer.patch({ type })}
        onViewModeChange={mode => updatePreference('viewMode', mode)}
        onDensityChange={density => updatePreference('density', density)}
        onUpload={() => filePickerRef.current?.click()}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenSettings={() => setDialog('settings')}
      />

      {/* Home is a landing surface; every other folder is a place you went to
          on purpose, and a rail there would just be in the way. */}
      {explorer.search.path === '' && !explorer.isSearching && preferences.showShelves ? (
        <ContinueRail
          ledger={ledger}
          onOpen={openEntry}
          onHide={() => updatePreference('showShelves', false)}
        />
      ) : null}

      <SelectionBar
        entries={selection.selectedEntries}
        clipboardCount={operations.clipboardCount}
        canWrite={canWrite}
        canDelete={canDelete}
        onCopy={operations.copy}
        onCut={operations.cut}
        onPaste={operations.paste}
        onDownload={operations.download}
        onDetails={() => setDialog('details')}
        onDelete={() => setDialog('delete')}
        onClear={selection.clear}
      />

      <ExplorerBody
        explorer={explorer}
        focus={selection}
        preferences={preferences}
        canWrite={canWrite}
        bottomInset={trayInset}
        progressFor={progressFor}
        peekHandlersFor={(entry, index) => ({
          ...peek.handlersFor(entry, index),
          ...hoverPreview.handlersFor(entry),
        })}
        onSelect={(index, modifiers) => {
          // The click that ends a long press must not also change the selection
          // — the press already opened a Peek, and selecting behind it would be
          // an action the user never asked for.
          if (peek.consumeSuppressedClick()) return;
          selection.selectAt(index, modifiers);
        }}
        onColumnsChange={setGridColumns}
        onOpen={openEntry}
        onContextMenu={(entry, index, event) => {
          event.preventDefault();
          selection.focusForContextMenu(index);
          setContextTarget({ entry, x: event.clientX, y: event.clientY });
        }}
        onNewFolder={() => setDialog('newFolder')}
        onUpload={() => filePickerRef.current?.click()}
      />

      <DropOverlay isActive={dropZone.isActive} />

      <UploadPanel
        jobs={uploads.jobs}
        overallProgress={uploads.overallProgress}
        activeCount={uploads.activeCount}
        onCancel={uploads.cancel}
        onDismiss={uploads.clearFinished}
      />

      <UploadInputs fileRef={filePickerRef} folderRef={folderPickerRef} onFiles={startUpload} />

      {hoverPreview.target ? <HoverPreview target={hoverPreview.target} /> : null}

      {peek.target ? (
        <PeekCard
          target={peek.target}
          progress={progressFor(peek.target.entry.path)}
          actions={entryActions}
          onClose={peek.close}
          onSelect={index => {
            peek.close();
            // Ctrl semantics: long-pressing a second item adds it, which is how
            // multi-select is entered on touch now that long-press means Peek.
            selection.selectAt(index, { ctrl: true });
          }}
        />
      ) : null}

      {contextTarget ? (
        <EntryContextMenu
          entry={contextTarget.entry}
          position={contextTarget}
          selectionCount={selection.selectedEntries.length}
          actions={entryActions}
          onClose={() => setContextTarget(null)}
        />
      ) : null}

      <DetailsDialog
        entry={actionSubject}
        open={dialog === 'details'}
        onOpenChange={next => setDialog(next ? 'details' : 'none')}
      />

      <ExplorerModals
        commands={commands}
        dialog={dialog}
        setDialog={setDialog}
        isPaletteOpen={isPaletteOpen}
        setPaletteOpen={setPaletteOpen}
        currentPath={explorer.search.path}
        selectedName={selectedEntry?.name}
        selectedPath={selectedEntry?.path}
        deleteCount={selection.selectedEntries.length}
        runOperation={operations.run}
        deleteSelection={operations.remove}
      />
    </div>
  );
}
