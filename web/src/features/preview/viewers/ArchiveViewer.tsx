import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookImage, FileArchive } from 'lucide-react';

import { api } from '@/lib/api';
import { useKeyBindings } from '@/lib/keys';
import { Button } from '@/ui/Button';
import { Centered, Notice, Spinner } from '@/ui/Feedback';
import { ViewerFrame } from '../ViewerFrame';
import type { ViewerProps } from '../overlay';
import { ArchiveBrowser } from './archive/ArchiveBrowser';
import { childrenOf, summaryOf } from './archive/rows';
import { ComicReader } from './ComicViewer';

export default function ArchiveViewer({ entry }: ViewerProps) {
  const [asComic, setAsComic] = useState(false);
  const [folder, setFolder] = useState('');
  const [filter, setFilter] = useState('');

  const { data, isPending, error } = useQuery({
    queryKey: ['archive', entry.path],
    queryFn: ({ signal }) => api.openArchive(entry.path, signal),
    staleTime: Infinity,
    retry: false,
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return childrenOf(data.entries, folder);
    return data.entries
      .filter(item => !item.isDirectory && item.name.toLowerCase().includes(needle))
      .map(item => ({ ...item, path: item.name }));
  }, [data, folder, filter]);

  // Capture phase, ahead of the overlay: Escape in the search clears it rather
  // than closing the whole preview.
  useKeyBindings(
    [{ key: 'Escape', inFields: true, when: () => filter !== '', run: () => setFilter('') }],
    { capture: true },
  );

  if (asComic) return <ComicReader entry={entry} />;

  const summary = data ? summaryOf(data) : undefined;

  return (
    <ViewerFrame
      entry={entry}
      subtitle={summary}
      tone="paper"
      actions={
        data?.looksLikeComic ? (
          <Button variant="quiet" size="sm" onClick={() => setAsComic(true)}>
            <BookImage /> Read as comic
          </Button>
        ) : null
      }
    >
      {isPending ? (
        <Centered>
          <Spinner />
        </Centered>
      ) : error ? (
        <Notice
          icon={<FileArchive />}
          title="This archive could not be opened"
          body={error.message}
        />
      ) : (
        <ArchiveBrowser
          archive={entry}
          data={data}
          rows={rows}
          folder={folder}
          onFolder={setFolder}
          filter={filter}
          onFilter={setFilter}
        />
      )}
    </ViewerFrame>
  );
}
