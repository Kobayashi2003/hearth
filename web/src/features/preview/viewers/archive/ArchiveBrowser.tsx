import { ArrowLeft, LayoutGrid, List, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { ArchiveListing, FileEntry } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';
import { viewerKindFor } from '@/lib/file-kind';
import { useRemembered } from '@/lib/storage';
import { Button } from '@/ui/Button';
import { useOverlay } from '../../overlay';
import { ArchiveCovers } from './ArchiveCovers';
import { ArchiveList } from './ArchiveList';
import { LOCKED, memberEntry, type Row } from './rows';

/**
 * The inside of an opened archive: the folder shown and its way up, list or
 * covers, the search, and the members themselves. A file opens in its usual
 * viewer over the archive, stepping through the files of its kind in view;
 * one no viewer takes, or every one while an administrator has opening them
 * turned off, opens in a new tab.
 */
export function ArchiveBrowser({
  archive,
  data,
  rows,
  folder,
  onFolder,
  filter,
  onFilter,
}: {
  archive: FileEntry;
  data: ArchiveListing;
  rows: Row[];
  folder: string;
  onFolder: (folder: string) => void;
  filter: string;
  onFilter: (filter: string) => void;
}) {
  const { openInside } = useOverlay();
  // Per device, like the folder view: list by default, since covers unpack every picture.
  const [view, setView] = useRemembered<'list' | 'covers'>('archive.view', 'list');

  const openRow = (row: Row) => {
    if (row.isDirectory) return onFolder(row.path);
    if (row.encrypted) return void toast.info(LOCKED.title, { description: LOCKED.body });
    const member = memberEntry(archive, row);
    const kind = viewerKindFor(member);
    if (!data.membersOpen || kind === 'none') {
      window.open(mediaUrls.archiveEntry(archive.path, row.path), '_blank', 'noopener');
      return;
    }
    const gallery = rows
      .filter(other => !other.isDirectory && !other.encrypted)
      .map(other => memberEntry(archive, other))
      .filter(other => viewerKindFor(other) === kind);
    openInside(member, gallery);
  };

  const covers = view === 'covers';
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <Button
          size="icon"
          disabled={!folder || Boolean(filter)}
          onClick={() => onFolder(folder.slice(0, Math.max(0, folder.lastIndexOf('/'))))}
          aria-label="Up one folder"
        >
          <ArrowLeft />
        </Button>
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">/{folder}</span>
        <Button
          size="icon"
          onClick={() => setView(covers ? 'list' : 'covers')}
          aria-label={covers ? 'Show as list' : 'Show as covers'}
          title={covers ? 'Show as list' : 'Show as covers'}
        >
          {covers ? <List /> : <LayoutGrid />}
        </Button>
        <label className="flex h-8 w-56 items-center gap-2 rounded-lg bg-sunken px-2.5 text-ink-3 max-sm:w-36">
          <Search className="size-4" />
          <input
            value={filter}
            onChange={event => onFilter(event.target.value)}
            placeholder="Find in archive"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
          />
        </label>
      </div>
      {filter && data.hasMore ? (
        <p className="border-b border-line bg-sunken px-4 py-1.5 text-[12.5px] text-ink-2">
          Only the {data.entries.length.toLocaleString()} listed items are searched.
        </p>
      ) : null}
      {covers ? (
        <ArchiveCovers archive={archive} rows={rows} pictures={data.membersOpen} onOpen={openRow} />
      ) : (
        <ArchiveList archive={archive} rows={rows} onOpen={openRow} />
      )}
    </div>
  );
}
