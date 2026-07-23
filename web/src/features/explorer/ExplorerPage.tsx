import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Copy,
  Download,
  FolderPlus,
  FolderOpen,
  Keyboard,
  Maximize,
  RefreshCw,
  Scissors,
  Trash2,
  Upload,
} from 'lucide-react';
import type { FileEntry } from '@hearth/shared';

import { Button } from '@/components/ui/Button';
import { Skeleton, StatusPanel } from '@/components/ui/primitives';
import { api, mediaUrls } from '@/lib/api';
import { useSession } from '@/features/auth/SessionProvider';
import { useShell } from '@/features/shell/AppShell';
import { usePreview } from '@/features/mantel/PreviewProvider';
import { isPreviewable } from '@/features/mantel/viewerFor';
import { DropOverlay, UploadPanel } from '@/features/transfer/UploadPanel';
import {
  collectDroppedFiles,
  collectPickedFiles,
  useUploads,
} from '@/features/transfer/useUploads';
import { SettingsDialog } from '@/features/admin/SettingsDialog';
import { CommandPalette, ShortcutsDialog } from './CommandPalette';
import { EntryContextMenu } from './EntryContextMenu';
import { FileGrid } from './FileGrid';
import { FileList } from './FileList';
import { SelectionBar } from './SelectionBar';
import { Toolbar } from './Toolbar';
import { ConfirmDialog, NameDialog } from './dialogs';
import { isTypingTarget, matchCommand, type Command } from './commands';
import { useExplorerState } from './useExplorerState';
import { useSelection } from './useSelection';

interface Clipboard {
  paths: string[];
  mode: 'copy' | 'cut';
}

type OpenDialog = 'none' | 'newFolder' | 'rename' | 'delete' | 'shortcuts' | 'settings';

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
  const [isDragActive, setDragActive] = useState(false);
  const [contextTarget, setContextTarget] = useState<{ entry: FileEntry; x: number; y: number } | null>(null);

  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const folderPickerRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);

  const canWrite = can('write');
  const canDelete = can('delete');

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['listing'] });
  }, [queryClient]);

  const uploads = useUploads(refresh);

  // Selection belongs to a directory; carrying it across a navigation would
  // let a later action apply to files the user can no longer see.
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

  // ── Operations ────────────────────────────────────────────────────────────

  const runOperation = useCallback(
    async (label: string, operation: () => Promise<{ results?: Array<{ ok: boolean; error?: string }> }>) => {
      try {
        const outcome = await operation();
        const failures = outcome.results?.filter(result => !result.ok) ?? [];
        if (failures.length > 0) {
          toast.error(`${label}: ${failures.length} failed`, {
            description: failures[0]?.error,
          });
        } else {
          toast.success(label);
        }
        selection.clear();
        refresh();
      } catch (error) {
        toast.error(label, {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [refresh, selection],
  );

  const downloadSelection = useCallback(async () => {
    const entries = selection.selectedEntries;
    if (entries.length === 0) return;

    if (entries.length === 1 && !entries[0]!.isDirectory) {
      window.location.href = mediaUrls.download(entries[0]!.path);
      return;
    }

    try {
      const ticket = await api.requestZip(entries.map(entry => entry.path));
      window.location.href = mediaUrls.zip(ticket.token);
    } catch (error) {
      toast.error('Could not prepare the download', {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }, [selection.selectedEntries]);

  const paste = useCallback(() => {
    if (!clipboard) return;
    const label = clipboard.mode === 'copy' ? 'Copied' : 'Moved';
    void runOperation(label, () =>
      clipboard.mode === 'copy'
        ? api.copy(clipboard.paths, explorer.search.path)
        : api.move(clipboard.paths, explorer.search.path),
    );
    if (clipboard.mode === 'cut') setClipboard(null);
  }, [clipboard, explorer.search.path, runOperation]);

  const startUpload = useCallback(
    (files: Array<{ file: File; relativePath: string }>) => {
      if (files.length === 0) return;
      void uploads.start(files, explorer.search.path);
    },
    [uploads, explorer.search.path],
  );

  // ── Commands ──────────────────────────────────────────────────────────────

  const commands = useMemo<Command[]>(
    () => [
      { id: 'refresh', label: 'Refresh', group: 'Navigate', icon: RefreshCw, shortcut: 'F5', run: refresh },
      { id: 'up', label: 'Go up one folder', group: 'Navigate', icon: FolderOpen, shortcut: 'Alt+←', run: explorer.goUp, isAvailable: !explorer.atRoot },
      { id: 'home', label: 'Go to home folder', group: 'Navigate', icon: FolderOpen, shortcut: 'Alt+Home', run: () => explorer.openDirectory('') },
      { id: 'select-all', label: 'Select all', group: 'Selection', icon: Copy, shortcut: 'Ctrl+A', run: selection.selectAll },
      { id: 'invert', label: 'Invert selection', group: 'Selection', icon: Copy, run: selection.invert },
      { id: 'clear', label: 'Clear selection', group: 'Selection', icon: Copy, run: selection.clear },
      { id: 'new-folder', label: 'New folder', group: 'File', icon: FolderPlus, shortcut: 'Ctrl+Shift+N', run: () => setDialog('newFolder'), isAvailable: canWrite },
      { id: 'upload', label: 'Upload files', group: 'File', icon: Upload, shortcut: 'Ctrl+U', run: () => filePickerRef.current?.click(), isAvailable: canWrite },
      { id: 'upload-folder', label: 'Upload a folder', group: 'File', icon: Upload, run: () => folderPickerRef.current?.click(), isAvailable: canWrite },
      { id: 'download', label: 'Download selection', group: 'File', icon: Download, run: () => void downloadSelection(), isAvailable: selection.selectedEntries.length > 0 },
      { id: 'copy', label: 'Copy', group: 'File', icon: Copy, shortcut: 'Ctrl+C', run: () => setClipboard({ paths: selection.selectedEntries.map(e => e.path), mode: 'copy' }), isAvailable: canWrite && selection.selectedEntries.length > 0 },
      { id: 'cut', label: 'Cut', group: 'File', icon: Scissors, shortcut: 'Ctrl+X', run: () => setClipboard({ paths: selection.selectedEntries.map(e => e.path), mode: 'cut' }), isAvailable: canWrite && selection.selectedEntries.length > 0 },
      { id: 'paste', label: 'Paste', group: 'File', icon: Copy, shortcut: 'Ctrl+V', run: paste, isAvailable: canWrite && clipboard !== null },
      { id: 'rename', label: 'Rename', group: 'File', icon: FolderPlus, shortcut: 'F2', run: () => setDialog('rename'), isAvailable: canWrite && selection.selectedEntries.length === 1 },
      { id: 'delete', label: 'Delete', group: 'File', icon: Trash2, shortcut: 'Delete', run: () => setDialog('delete'), isAvailable: canDelete && selection.selectedEntries.length > 0 },
      { id: 'view', label: 'Switch between list and grid', group: 'View', icon: Maximize, run: () => updatePreference('viewMode', preferences.viewMode === 'list' ? 'grid' : 'list') },
      { id: 'density', label: 'Switch row density', group: 'View', icon: Maximize, run: () => updatePreference('density', preferences.density === 'comfortable' ? 'compact' : 'comfortable') },
      { id: 'fullscreen', label: 'Toggle fullscreen', group: 'View', icon: Maximize, shortcut: 'F11', run: () => void toggleFullscreen() },
      { id: 'settings', label: 'Open settings', group: 'Application', icon: FolderOpen, run: () => setDialog('settings') },
      { id: 'shortcuts', label: 'Keyboard shortcuts', group: 'Application', icon: Keyboard, shortcut: 'Ctrl+/', run: () => setDialog('shortcuts') },
    ],
    [
      refresh, explorer, selection, canWrite, canDelete, clipboard, paste, downloadSelection,
      preferences.viewMode, preferences.density, updatePreference,
    ],
  );

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

  // ── Drag and drop ─────────────────────────────────────────────────────────

  const dropHandlers = canWrite
    ? {
        onDragEnter: (event: React.DragEvent) => {
          event.preventDefault();
          dragDepth.current += 1;
          if (event.dataTransfer.types.includes('Files')) setDragActive(true);
        },
        onDragOver: (event: React.DragEvent) => event.preventDefault(),
        onDragLeave: () => {
          // Nested elements fire leave events; only the outermost one counts.
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) setDragActive(false);
        },
        onDrop: (event: React.DragEvent) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragActive(false);
          void collectDroppedFiles(event.dataTransfer).then(startUpload);
        },
      }
    : {};

  const selectedEntry = selection.selectedEntries[0];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" {...dropHandlers}>
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
        onCopy={() => setClipboard({ paths: selection.selectedEntries.map(e => e.path), mode: 'copy' })}
        onCut={() => setClipboard({ paths: selection.selectedEntries.map(e => e.path), mode: 'cut' })}
        onPaste={paste}
        onDownload={() => void downloadSelection()}
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

      <DropOverlay isActive={isDragActive} />

      <UploadPanel
        jobs={uploads.jobs}
        overallProgress={uploads.overallProgress}
        activeCount={uploads.activeCount}
        onCancel={uploads.cancel}
        onDismiss={uploads.clearFinished}
      />

      <input
        ref={filePickerRef}
        type="file"
        multiple
        hidden
        onChange={event => {
          if (event.target.files) startUpload(collectPickedFiles(event.target.files));
          event.target.value = '';
        }}
      />
      <input
        ref={folderPickerRef}
        type="file"
        hidden
        // Not a standard attribute; React needs it spelled this way.
        {...({ webkitdirectory: '' } as Record<string, string>)}
        onChange={event => {
          if (event.target.files) startUpload(collectPickedFiles(event.target.files));
          event.target.value = '';
        }}
      />

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
          onCopy={() => setClipboard({ paths: selection.selectedEntries.map(e => e.path), mode: 'copy' })}
          onCut={() => setClipboard({ paths: selection.selectedEntries.map(e => e.path), mode: 'cut' })}
          onDownload={() => void downloadSelection()}
          onDelete={() => setDialog('delete')}
        />
      ) : null}

      <CommandPalette commands={commands} open={isPaletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsDialog
        commands={commands}
        open={dialog === 'shortcuts'}
        onOpenChange={open => setDialog(open ? 'shortcuts' : 'none')}
      />
      <SettingsDialog
        open={dialog === 'settings'}
        onOpenChange={open => setDialog(open ? 'settings' : 'none')}
      />

      <NameDialog
        open={dialog === 'newFolder'}
        onOpenChange={open => setDialog(open ? 'newFolder' : 'none')}
        title="New folder"
        label="Folder name"
        confirmLabel="Create"
        onConfirm={name =>
          void runOperation('Folder created', async () => {
            await api.makeDirectory(explorer.search.path, name);
            return {};
          })
        }
      />

      <NameDialog
        open={dialog === 'rename'}
        onOpenChange={open => setDialog(open ? 'rename' : 'none')}
        title="Rename"
        label="New name"
        initialValue={selectedEntry?.name ?? ''}
        confirmLabel="Rename"
        onConfirm={name =>
          void runOperation('Renamed', async () => {
            if (selectedEntry) await api.rename(selectedEntry.path, name);
            return {};
          })
        }
      />

      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={open => setDialog(open ? 'delete' : 'none')}
        title={`Delete ${selection.selectedEntries.length} item${selection.selectedEntries.length === 1 ? '' : 's'}?`}
        description="Deleted items go to the recycle bin, where you can restore them."
        confirmLabel="Delete"
        isDestructive
        onConfirm={() =>
          void runOperation('Deleted', () =>
            api.remove(selection.selectedEntries.map(entry => entry.path)),
          )
        }
      />
    </div>
  );
}

/** The listing region: loading, empty, error, or content. */
function ExplorerBody({
  explorer,
  selection,
  preferences,
  canWrite,
  onOpen,
  onContextMenu,
  onNewFolder,
  onUpload,
}: {
  explorer: ReturnType<typeof useExplorerState>;
  selection: ReturnType<typeof useSelection>;
  preferences: ReturnType<typeof useShell>['preferences'];
  canWrite: boolean;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (entry: FileEntry, event: React.MouseEvent) => void;
  onNewFolder: () => void;
  onUpload: () => void;
}) {
  if (explorer.isPending) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-1 p-3">
        {Array.from({ length: 12 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (explorer.error) {
    return (
      <StatusPanel
        title="Could not open this folder"
        description={explorer.error instanceof Error ? explorer.error.message : undefined}
        action={
          <Button variant="primary" onClick={() => void explorer.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (explorer.entries.length === 0) {
    return explorer.isSearching ? (
      <StatusPanel
        title="No files match that search"
        description={
          explorer.search.recursive
            ? 'Try a different word, or clear the type filter.'
            : 'Try searching everywhere instead of just this folder.'
        }
      />
    ) : (
      <StatusPanel
        icon={<FolderOpen className="h-9 w-9" />}
        title="This folder is empty"
        description={canWrite ? 'Drop files here, or start with a new folder.' : undefined}
        action={
          canWrite ? (
            <div className="flex gap-2">
              <Button variant="primary" onClick={onUpload}>
                <Upload className="h-4 w-4" /> Upload files
              </Button>
              <Button onClick={onNewFolder}>
                <FolderPlus className="h-4 w-4" /> New folder
              </Button>
            </div>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      {explorer.isSearching ? (
        <p className="shrink-0 border-b border-subtle px-3 py-1.5 text-xs text-muted">
          {explorer.total} result{explorer.total === 1 ? '' : 's'}
          {explorer.provider ? ` · via ${explorer.provider}` : ''}
        </p>
      ) : null}

      {preferences.viewMode === 'grid' ? (
        <FileGrid
          entries={explorer.entries}
          selected={selection.selected}
          tileSize={preferences.gridSize}
          onSelect={selection.select}
          onOpen={onOpen}
          onContextMenu={onContextMenu}
        />
      ) : (
        <FileList
          entries={explorer.entries}
          selected={selection.selected}
          density={preferences.density}
          sort={explorer.search.sort}
          direction={explorer.search.direction}
          showContainingFolder={explorer.isSearching && explorer.search.recursive}
          onSort={explorer.sortBy}
          onSelect={selection.select}
          onOpen={onOpen}
          onContextMenu={onContextMenu}
        />
      )}
    </>
  );
}

async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen().catch(() => undefined);
}
