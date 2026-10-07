import type { ComponentProps, RefObject } from 'react';
import { FolderOpen, FolderPlus, SearchX, TriangleAlert, Upload } from 'lucide-react';

import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { FileGrid } from './FileGrid';
import { FileList } from './FileList';
import { ListingSkeleton } from './ListingSkeleton';
import type { Explorer } from './useExplorer';

type Shared = Omit<
  ComponentProps<typeof FileList>,
  'sort' | 'direction' | 'onSort' | 'showFolder' | 'onReveal'
>;

/**
 * What fills the scrolling area: a skeleton while the folder loads, why it
 * could not be opened, an empty folder or search, or the items as tiles or rows.
 */
export function ListingBody({
  explorer,
  listing,
  isGrid,
  tileSize,
  canWrite,
  scrollRef,
  onColumns,
  onReveal,
  onUpload,
  onNewFolder,
}: {
  explorer: Explorer;
  listing: Shared;
  isGrid: boolean;
  tileSize: number;
  canWrite: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onColumns: (columns: number) => void;
  onReveal: (path: string) => void;
  onUpload: () => void;
  onNewFolder: () => void;
}) {
  if (explorer.isPending) {
    return (
      <ListingSkeleton
        view={isGrid ? 'grid' : 'list'}
        tileSize={tileSize}
        rowHeight={listing.rowHeight}
        scrollRef={scrollRef}
      />
    );
  }
  if (explorer.error) {
    return (
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
    );
  }
  if (listing.entries.length === 0) {
    return explorer.isSearching ? (
      <Notice
        icon={<SearchX />}
        title="Nothing matches"
        body={
          explorer.isRecursive
            ? 'Try fewer or different words, or clear the type filter.'
            : 'Try including subfolders too.'
        }
      />
    ) : (
      <EmptyFolder canWrite={canWrite} onUpload={onUpload} onNewFolder={onNewFolder} />
    );
  }
  if (isGrid) return <FileGrid {...listing} tileSize={tileSize} onColumns={onColumns} />;
  const { search } = explorer;
  return (
    <FileList
      {...listing}
      sort={search.sort}
      direction={search.direction}
      onSort={explorer.sortBy}
      showFolder={explorer.isSearching && explorer.isRecursive}
      onReveal={entry => onReveal(entry.path)}
    />
  );
}

function EmptyFolder({
  canWrite,
  onUpload,
  onNewFolder,
}: {
  canWrite: boolean;
  onUpload: () => void;
  onNewFolder: () => void;
}) {
  return (
    <Notice
      icon={<FolderOpen />}
      title="This folder is empty"
      body={canWrite ? 'Drop files here to upload them, or create a folder.' : undefined}
      action={
        canWrite ? (
          <div className="flex gap-2">
            <Button variant="primary" onClick={onUpload}>
              <Upload /> Upload files
            </Button>
            <Button variant="outline" onClick={onNewFolder}>
              <FolderPlus /> New folder
            </Button>
          </div>
        ) : undefined
      }
    />
  );
}
