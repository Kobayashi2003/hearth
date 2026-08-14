import { FolderOpen, FolderPlus, Upload } from 'lucide-react';
import type { FileEntry, Progress } from '@hearth/shared';

import { Button } from '@/components/ui/Button';
import { Skeleton, StatusPanel } from '@/components/ui/primitives';
import { type useShell } from '@/features/shell/AppShell';
import { FileGrid } from './listing/FileGrid';
import { FileList } from './listing/FileList';
import type { useExplorerFocus } from './listing/useExplorerFocus';
import type { useExplorerState } from './useExplorerState';

/** The listing region: loading, empty, error, or content, chosen in that order. */
export function ExplorerBody({
  explorer,
  focus,
  preferences,
  canWrite,
  bottomInset,
  progressFor,
  peekHandlersFor,
  onSelect,
  onColumnsChange,
  onOpen,
  onContextMenu,
  onNewFolder,
  onUpload,
}: {
  explorer: ReturnType<typeof useExplorerState>;
  focus: ReturnType<typeof useExplorerFocus>;
  preferences: ReturnType<typeof useShell>['preferences'];
  canWrite: boolean;
  /** Room to leave at the end of the listing for the floating selection bar. */
  bottomInset: number;
  progressFor: (path: string) => Progress | undefined;
  peekHandlersFor: (entry: FileEntry, index: number) => Record<string, unknown>;
  onSelect: (index: number, modifiers: { ctrl?: boolean; shift?: boolean }) => void;
  onColumnsChange: (columns: number) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (entry: FileEntry, index: number, event: React.MouseEvent) => void;
  onNewFolder: () => void;
  onUpload: () => void;
}) {
  if (explorer.isPending) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-1 p-3">
        {Array.from({ length: 12 }, (_, index) => (
          <Skeleton key={index} className="h-row w-full" />
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

  /** Both views take the same focus/selection contract; only layout differs. */
  const shared = {
    entries: explorer.entries,
    selectedPaths: focus.selectedPaths,
    focusedIndex: focus.focused,
    bottomInset,
    progressFor,
    peekHandlersFor,
    tabIndexFor: focus.tabIndexFor,
    onSelect,
    onOpen,
    onContextMenu,
    onKeyDown: focus.handleKeyDown,
    onBackgroundClick: focus.clear,
  };

  return (
    <>
      {explorer.isSearching ? (
        <p className="shrink-0 border-b border-subtle px-3 py-1.5 text-xs text-muted">
          {explorer.total} result{explorer.total === 1 ? '' : 's'}
          {explorer.provider ? ` · via ${explorer.provider}` : ''}
        </p>
      ) : null}

      {/* A folder past the cap is shown as a prefix. Saying so is the whole
          point: the previous build silently dropped everything past 500. */}
      {explorer.isTruncated ? (
        <p className="shrink-0 border-b border-subtle bg-accent-wash px-3 py-1.5 text-xs text-secondary">
          Showing the first {explorer.entries.length.toLocaleString()} of{' '}
          {explorer.total.toLocaleString()} items. Search to narrow this folder down.
        </p>
      ) : null}

      {preferences.viewMode === 'grid' ? (
        <FileGrid
          {...shared}
          tileSize={preferences.gridSize}
          showFolderCovers={preferences.folderCovers}
          density={preferences.density}
          onColumnsChange={onColumnsChange}
        />
      ) : (
        <FileList
          {...shared}
          sort={explorer.search.sort}
          direction={explorer.search.direction}
          showContainingFolder={explorer.isSearching && explorer.search.recursive}
          density={preferences.density}
          onSort={explorer.sortBy}
        />
      )}
    </>
  );
}
