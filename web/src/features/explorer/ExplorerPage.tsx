import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { FileEntry } from '@hearth/shared';

import { api, mediaUrls } from '@/lib/api';
import { useSession } from '@/features/auth/SessionProvider';
import { useShell } from '@/features/shell/AppShell';
import { usePreview } from '@/features/mantel/PreviewProvider';
import { isPreviewable } from '@/features/mantel/viewerFor';
import { DropOverlay, UploadPanel } from '@/features/transfer/UploadPanel';
import { UploadInputs } from '@/features/transfer/UploadInputs';
import { useDropZone } from '@/features/transfer/useDropZone';
import { useUploads } from '@/features/transfer/useUploads';
import { EntryContextMenu } from './EntryContextMenu';
import { ExplorerBody } from './ExplorerBody';
import { ExplorerModals, type OpenDialog } from './ExplorerModals';
import { SelectionBar } from './SelectionBar';
import { Toolbar } from './Toolbar';
import { isTypingTarget, matchCommand } from './commands';
import { useExplorerCommands } from './useExplorerCommands';
import { useExplorerState } from './useExplorerState';
import { useSelection } from './useSelection';

interface Clipboard {
  paths: string[];
  mode: 'copy' | 'cut';
}

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

  const selection = useSelection(explorer.entries);
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);
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
  useEffect(() => {
    selection.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explorer.search.path, explorer.search.q]);

  const openEntry = useCallback(
    (entry: FileEntry) => {
      if (entry.isDirectory) explorer.openDirectory(entry.path);
      else if (isPreviewable(entry)) preview.open(entry, explorer.gallery);
      else window.location.href = mediaUrls.download(entry.path);
    },
    [explorer, preview],
  );

  // ── Operations ──────────────────────────────────────────────────────────────

  const runOperation = useCallback(
    (label: string, operation: () => Promise<unknown>) => {
      void (async () => {
        try {
          const outcome = (await operation()) as { results?: Array<{ ok: boolean; error?: string }> };
          const failures = outcome?.results?.filter(result => !result.ok) ?? [];
          if (failures.length > 0) {
            toast.error(`${label}: ${failures.length} failed`, { description: failures[0]?.error });
          } else {
            toast.success(label);
          }
          selection.clear();
          refresh();
        } catch (error) {
          toast.error(label, { description: error instanceof Error ? error.message : undefined });
        }
      })();
    },
    [refresh, selection],
  );

  const downloadSelection = useCallback(() => {
    const entries = selection.selectedEntries;
    if (entries.length === 0) return;

    if (entries.length === 1 && !entries[0]!.isDirectory) {
      window.location.href = mediaUrls.download(entries[0]!.path);
      return;
    }

    void api
      .requestZip(entries.map(entry => entry.path))
      .then(ticket => {
        window.location.href = mediaUrls.zip(ticket.token);
      })
      .catch(error => {
        toast.error('Could not prepare the download', {
          description: error instanceof Error ? error.message : undefined,
        });
      });
  }, [selection.selectedEntries]);

  const copySelection = useCallback(
    () => setClipboard({ paths: selection.selectedEntries.map(e => e.path), mode: 'copy' }),
    [selection.selectedEntries],
  );
  const cutSelection = useCallback(
    () => setClipboard({ paths: selection.selectedEntries.map(e => e.path), mode: 'cut' }),
    [selection.selectedEntries],
  );

  const paste = useCallback(() => {
    if (!clipboard) return;
    const label = clipboard.mode === 'copy' ? 'Copied' : 'Moved';
    runOperation(label, () =>
      clipboard.mode === 'copy'
        ? api.copy(clipboard.paths, explorer.search.path)
        : api.move(clipboard.paths, explorer.search.path),
    );
    if (clipboard.mode === 'cut') setClipboard(null);
  }, [clipboard, explorer.search.path, runOperation]);

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
    clipboardHasItems: clipboard !== null,
    paste,
    copySelection,
    cutSelection,
    downloadSelection,
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

      <SelectionBar
        entries={selection.selectedEntries}
        clipboardCount={clipboard?.paths.length ?? 0}
        canWrite={canWrite}
        canDelete={canDelete}
        onCopy={copySelection}
        onCut={cutSelection}
        onPaste={paste}
        onDownload={downloadSelection}
        onDelete={() => setDialog('delete')}
        onClear={selection.clear}
      />

      <ExplorerBody
        explorer={explorer}
        selection={selection}
        preferences={preferences}
        canWrite={canWrite}
        onOpen={openEntry}
        onContextMenu={(entry, event) => {
          event.preventDefault();
          if (!selection.selected.has(entry.path)) {
            selection.select(entry.path, explorer.entries.indexOf(entry), {});
          }
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

      {contextTarget ? (
        <EntryContextMenu
          entry={contextTarget.entry}
          position={contextTarget}
          selectionCount={selection.selectedEntries.length}
          canWrite={canWrite}
          canDelete={canDelete}
          onClose={() => setContextTarget(null)}
          onOpen={() => openEntry(contextTarget.entry)}
          onPreview={() => preview.open(contextTarget.entry, explorer.gallery)}
          onRename={() => setDialog('rename')}
          onCopy={copySelection}
          onCut={cutSelection}
          onDownload={downloadSelection}
          onDelete={() => setDialog('delete')}
        />
      ) : null}

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
        runOperation={runOperation}
        deleteSelection={() =>
          runOperation('Deleted', () => api.remove(selection.selectedEntries.map(entry => entry.path)))
        }
      />
    </div>
  );
}
