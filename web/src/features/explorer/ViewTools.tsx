import {
  ArrowUpDown,
  FolderPlus,
  FolderUp,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import type { SortField, ViewMode } from '@hearth/shared';

import { useCoarsePointer } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import { Button } from '@/ui/Button';
import { Segmented } from '@/ui/Field';
import { Menu, MenuChoice, MenuItem, MenuLabel, MenuSeparator } from '@/ui/Menu';
import type { Explorer } from './useExplorer';

const SORTS: ReadonlyArray<[SortField, string]> = [
  ['name', 'Name'],
  ['mtime', 'Date modified'],
  ['size', 'Size'],
  ['type', 'Type'],
];

/** What the toolbar acts on, in whichever layout it takes. */
export interface ToolProps {
  viewMode: ViewMode;
  canWrite: boolean;
  onViewMode: (mode: ViewMode) => void;
  onNewFolder: () => void;
  onUploadFiles: () => void;
  onUploadFolder: () => void;
}

/** Refresh, sort, list or covers, and (for writers) New. */
export function ViewTools({
  explorer,
  viewMode,
  canWrite,
  onViewMode,
  onNewFolder,
  onUploadFiles,
  onUploadFolder,
}: ToolProps & { explorer: Explorer }) {
  const { isFetching } = explorer;
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1 pb-0.5">
      <Button
        size="icon"
        onClick={() => void explorer.refetch()}
        aria-label="Refresh"
        title="Refresh (F5)"
      >
        <RefreshCw className={cn(isFetching && 'animate-spin')} />
      </Button>
      <Menu
        trigger={
          <Button size="icon" aria-label="Sort" title="Sort">
            <ArrowUpDown />
          </Button>
        }
      >
        <SortChoices explorer={explorer} />
      </Menu>
      <Segmented<ViewMode>
        label="View"
        value={viewMode}
        onChange={onViewMode}
        options={[
          { value: 'list', label: <List />, title: 'List' },
          { value: 'grid', label: <LayoutGrid />, title: 'Covers' },
        ]}
      />
      {canWrite ? (
        <NewMenu
          onNewFolder={onNewFolder}
          onUploadFiles={onUploadFiles}
          onUploadFolder={onUploadFolder}
        />
      ) : null}
    </div>
  );
}

function SortChoices({ explorer }: { explorer: Explorer }) {
  const { search, patch } = explorer;
  return (
    <>
      <MenuLabel>Sort by</MenuLabel>
      {SORTS.map(([field, label]) => (
        <MenuChoice
          key={field}
          checked={search.sort === field}
          onSelect={() => patch({ sort: field })}
        >
          {label}
        </MenuChoice>
      ))}
      <MenuSeparator />
      <MenuChoice checked={search.direction === 'asc'} onSelect={() => patch({ direction: 'asc' })}>
        Ascending
      </MenuChoice>
      <MenuChoice
        checked={search.direction === 'desc'}
        onSelect={() => patch({ direction: 'desc' })}
      >
        Descending
      </MenuChoice>
    </>
  );
}

/**
 * New folder and uploads. A phone's browser cannot pick a whole folder, so
 * that item is left out where the pointer is a finger.
 */
export function NewMenu({
  onNewFolder,
  onUploadFiles,
  onUploadFolder,
  compact = false,
}: {
  onNewFolder: () => void;
  onUploadFiles: () => void;
  onUploadFolder: () => void;
  compact?: boolean;
}) {
  const touch = useCoarsePointer();
  return (
    <Menu
      trigger={
        compact ? (
          <Button size="icon" aria-label="New" title="New">
            <Plus />
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            className="ml-1 max-sm:w-9 max-sm:justify-center max-sm:px-0"
            aria-label="New"
          >
            <Plus />
            <span className="max-sm:hidden">New</span>
          </Button>
        )
      }
    >
      <MenuItem icon={<FolderPlus />} onSelect={onNewFolder} shortcut="Ctrl+Shift+N">
        Folder
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<Upload />} onSelect={onUploadFiles} shortcut="Ctrl+U">
        Upload files
      </MenuItem>
      {touch ? null : (
        <MenuItem icon={<FolderUp />} onSelect={onUploadFolder}>
          Upload a folder
        </MenuItem>
      )}
    </Menu>
  );
}

/** Where the toolbar has no room: list or covers, sorting and refresh, in one menu. */
export function ViewMenu({
  explorer,
  viewMode,
  onViewMode,
}: {
  explorer: Explorer;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
}) {
  return (
    <Menu
      trigger={
        <Button size="icon" aria-label="View options" title="View options">
          <SlidersHorizontal />
        </Button>
      }
    >
      <MenuLabel>Show as</MenuLabel>
      <MenuChoice checked={viewMode === 'list'} onSelect={() => onViewMode('list')}>
        List
      </MenuChoice>
      <MenuChoice checked={viewMode === 'grid'} onSelect={() => onViewMode('grid')}>
        Covers
      </MenuChoice>
      <MenuSeparator />
      <SortChoices explorer={explorer} />
      <MenuSeparator />
      <MenuItem icon={<RefreshCw />} onSelect={() => void explorer.refetch()}>
        Refresh
      </MenuItem>
    </Menu>
  );
}
