import { FolderOpen, FolderPlus, Upload } from 'lucide-react';
import type { FileEntry } from '@hearth/shared';

import { Button } from '@/components/ui/Button';
import { Skeleton, StatusPanel } from '@/components/ui/primitives';
import { type useShell } from '@/features/shell/AppShell';
import { FileGrid } from './FileGrid';
import { FileList } from './FileList';
import type { useExplorerState } from './useExplorerState';
import type { useSelection } from './useSelection';

/** The listing region: loading, empty, error, or content, chosen in that order. */
export function ExplorerBody({
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
