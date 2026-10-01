import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookImage, Download, FileArchive, Folder, Search } from 'lucide-react';
import type { ArchiveEntry } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';
import { api } from '@/lib/api';
import { iconFor } from '@/lib/file-kind';
import { formatSize } from '@/lib/format';
import { Button } from '@/ui/Button';
import { Centered, Notice, Spinner } from '@/ui/Feedback';
import { ViewerFrame } from '../ViewerFrame';
import type { ViewerProps } from '../overlay';
import { ComicReader } from './ComicViewer';

const IMAGE = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;

interface Row {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}

/** The direct children of `folder`, with implied directories filled in. */
function childrenOf(entries: ArchiveEntry[], folder: string): Row[] {
  const prefix = folder ? `${folder}/` : '';
  const rows = new Map<string, Row>();
  for (const entry of entries) {
    if (!entry.name.startsWith(prefix) || entry.name === folder) continue;
    const rest = entry.name.slice(prefix.length);
    const cut = rest.indexOf('/');
    if (cut === -1) {
      rows.set(rest, {
        name: rest,
        path: entry.name,
        isDirectory: entry.isDirectory,
        size: entry.size,
      });
    } else {
      const name = rest.slice(0, cut);
      if (!rows.has(name))
        rows.set(name, { name, path: prefix + name, isDirectory: true, size: 0 });
    }
  }
  return [...rows.values()].sort((a, b) =>
    a.isDirectory !== b.isDirectory
      ? a.isDirectory
        ? -1
        : 1
      : a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

export default function ArchiveViewer({ entry }: ViewerProps) {
  const [asComic, setAsComic] = useState(false);
  const [folder, setFolder] = useState('');
  const [filter, setFilter] = useState('');
  const [image, setImage] = useState<string | null>(null);

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
      .map(item => ({ name: item.name, path: item.name, isDirectory: false, size: item.size }));
  }, [data, folder, filter]);

  if (asComic) return <ComicReader entry={entry} />;

  const summary = data
    ? `${data.total.toLocaleString()} items${data.hasMore ? ', showing the first part' : ''}`
    : undefined;

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
        <div className="absolute inset-0 flex flex-col">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2">
            <Button
              size="icon"
              disabled={!folder || Boolean(filter)}
              onClick={() => setFolder(folder.slice(0, Math.max(0, folder.lastIndexOf('/'))))}
              aria-label="Up one folder"
            >
              <ArrowLeft />
            </Button>
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
              {folder ? `/${folder}` : '/'}
            </span>
            <label className="flex h-8 w-56 items-center gap-2 rounded-lg bg-sunken px-2.5 text-ink-3">
              <Search className="size-4" />
              <input
                value={filter}
                onChange={event => setFilter(event.target.value)}
                placeholder="Find in archive"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
              />
            </label>
          </div>
          <ul className="scroll-thin min-h-0 flex-1 overflow-auto py-1">
            {rows.map(row => {
              const Icon = row.isDirectory
                ? Folder
                : iconFor({ name: row.name, mimeType: '', isDirectory: false });
              return (
                <li
                  key={row.path}
                  className="group flex h-row items-center gap-3 px-4 hover:bg-sunken"
                >
                  <Icon className="size-4 shrink-0 text-ink-3" />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-[13.5px]"
                    onClick={() => {
                      if (row.isDirectory) setFolder(row.path);
                      else if (IMAGE.test(row.name)) setImage(row.path);
                      else
                        window.open(
                          mediaUrls.archiveEntry(entry.path, row.path),
                          '_blank',
                          'noopener',
                        );
                    }}
                  >
                    {row.name}
                  </button>
                  {!row.isDirectory ? (
                    <>
                      <span className="tabular text-[12px] text-ink-3">{formatSize(row.size)}</span>
                      <a
                        href={mediaUrls.archiveEntry(entry.path, row.path)}
                        download={row.name.split('/').pop()}
                        aria-label={`Download ${row.name}`}
                        className="grid size-7 place-items-center rounded-md text-ink-3 opacity-0 hover:bg-bg hover:text-ink group-hover:opacity-100"
                      >
                        <Download className="size-4" />
                      </a>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {image ? (
        <button
          type="button"
          aria-label="Close image"
          onClick={() => setImage(null)}
          className="animate-fade absolute inset-0 z-30 grid place-items-center bg-stage/95 p-4"
        >
          <img
            src={mediaUrls.archiveEntry(entry.path, image)}
            alt={image}
            className="max-h-full max-w-full object-contain"
          />
        </button>
      ) : null}
    </ViewerFrame>
  );
}
