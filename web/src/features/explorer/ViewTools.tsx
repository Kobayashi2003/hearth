import {
  ArrowUpDown,
  FolderPlus,
  FolderUp,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Upload,
} from 'lucide-react';
import type { SortField, ViewMode } from '@hearth/shared';

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

/** Refresh, sort, list or covers, and (for writers) New. */
export function ViewTools({
  explorer,
  viewMode,
  canWrite,
  onViewMode,
  onNewFolder,
  onUploadFiles,
  onUploadFolder,
}: {
  explorer: Explorer;
  viewMode: ViewMode;
  canWrite: boolean;
  onViewMode: (mode: ViewMode) => void;
  onNewFolder: () => void;
  onUploadFiles: () => void;
  onUploadFolder: () => void;
}) {
  const { search, patch, isFetching } = explorer;
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
        <MenuChoice
          checked={search.direction === 'asc'}
          onSelect={() => patch({ direction: 'asc' })}
        >
          Ascending
        </MenuChoice>
        <MenuChoice
          checked={search.direction === 'desc'}
          onSelect={() => patch({ direction: 'desc' })}
        >
          Descending
        </MenuChoice>
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
        <Menu
          trigger={
            <Button
              variant="primary"
              size="sm"
              className="ml-1 max-sm:w-9 max-sm:justify-center max-sm:px-0"
              aria-label="New"
            >
              <Plus />
              <span className="max-sm:hidden">New</span>
            </Button>
          }
        >
          <MenuItem icon={<FolderPlus />} onSelect={onNewFolder} shortcut="Ctrl+Shift+N">
            Folder
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Upload />} onSelect={onUploadFiles} shortcut="Ctrl+U">
            Upload files
          </MenuItem>
          <MenuItem icon={<FolderUp />} onSelect={onUploadFolder}>
            Upload a folder
          </MenuItem>
        </Menu>
      ) : null}
    </div>
  );
}
