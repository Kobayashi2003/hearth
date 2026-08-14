import { lazy, Suspense, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ChevronRight, ExternalLink, FileArchive, Folder, Search } from 'lucide-react';
import type { ArchiveEntry } from '@hearth/shared';

import { Button } from '@/components/ui/Button';
import { Spinner, StatusPanel, Tooltip } from '@/components/ui/primitives';
import { api, mediaUrls } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatSize, formatWhen } from '@/lib/format';
import { FileGlyph } from '@/components/FileGlyph';
import { ViewerChrome } from '../ViewerChrome';
import type { ViewerProps } from './types';

/**
 * The comic reader, in case this archive turns out to be one. Loaded only if
 * asked for, so a zip of documents never pays for the comic pipeline.
 */
const ComicViewer = lazy(() => import('./ComicViewer'));

/**
 * What is inside an archive, without unpacking it.
 *
 * A zip is browsed rather than read: the listing is walked as a tree, and a
 * single member can be opened on its own — which is what people actually want
 * nine times out of ten, having downloaded a whole archive to look at one file
 * inside it.
 *
 * Plenty of manga is distributed as a bare `.zip`, so an archive of nothing but
 * pictures offers to be read as a comic instead of listing three hundred
 * filenames nobody wants to see.
 */
export default function ArchiveViewer({ item, onStep, ...chrome }: ViewerProps) {
  const path = item.entry.path;
  const [folder, setFolder] = useState('');
  const [filter, setFilter] = useState('');
  const [asComic, setAsComic] = useState(false);

  const { data, error, isPending } = useQuery({
    queryKey: ['archive', path],
    queryFn: ({ signal }) => api.openArchive(path, signal),
    retry: false,
    staleTime: Infinity,
  });

  const rows = useMemo(() => childrenOf(data?.entries ?? [], folder, filter), [data, folder, filter]);

  if (asComic) {
    return (
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        }
      >
        <ComicViewer item={item} onStep={onStep} {...chrome} />
      </Suspense>
    );
  }

  return (
    <ViewerChrome
      flow="document"
      item={item}
      onStep={onStep}
      galleryArrows="none"
      controls={
        data?.looksLikeComic ? (
          <Tooltip label="Every file in here is a picture">
            <Button variant="ghost" size="sm" onClick={() => setAsComic(true)}>
              <BookOpen className="h-4 w-4" /> Read as a comic
            </Button>
          </Tooltip>
        ) : undefined
      }
      {...chrome}
    >
      <div className="flex h-full min-h-0 flex-col bg-surface">
        {isPending ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : error ? (
          <StatusPanel
            icon={<FileArchive className="h-8 w-8" />}
            title="This archive could not be opened"
            description={error instanceof Error ? error.message : undefined}
            action={
              <a
                href={mediaUrls.download(path)}
                download={item.entry.name}
                className="text-sm text-accent hover:underline"
              >
                Download it instead
              </a>
            }
          />
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-subtle px-3 py-1.5">
              <InnerBreadcrumb folder={folder} onNavigate={setFolder} />

              <label className="relative ml-auto shrink-0">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input
                  value={filter}
                  onChange={event => setFilter(event.target.value)}
                  placeholder="Filter"
                  aria-label="Filter the archive"
                  // Sized against the preview *window*, not the screen: the two
                  // stopped being the same thing when the window became sizable,
                  // and a `sm:` here would widen this in a window with no room
                  // for it. `@` variants read the container the window declares.
                  className="h-7 w-24 rounded-density bg-raised pl-7 pr-2 text-xs text-primary outline-none placeholder:text-muted @min-[32rem]:w-40"
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {rows.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted">
                  {filter ? 'Nothing here matches that.' : 'This folder is empty.'}
                </p>
              ) : (
                rows.map(row =>
                  row.isDirectory ? (
                    <button
                      key={row.name}
                      type="button"
                      onClick={() => {
                        setFilter('');
                        setFolder(row.name);
                      }}
                      className="flex min-h-tap w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-sunken"
                    >
                      <Folder className="h-4 w-4 shrink-0 text-accent" />
                      <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-primary">
                        {basename(row.name)}
                      </span>
                      <span className="tabular shrink-0 text-[0.6875rem] text-muted">
                        {row.count} item{row.count === 1 ? '' : 's'}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />
                    </button>
                  ) : (
                    <a
                      key={row.name}
                      href={mediaUrls.archiveEntry(path, row.name)}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex min-h-tap w-full items-center gap-2 px-3 py-1.5 hover:bg-sunken"
                    >
                      <FileGlyph
                        entry={{ name: row.name, mimeType: '', isDirectory: false }}
                        className="shrink-0 text-secondary"
                      />
                      <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-primary">
                        {basename(row.name)}
                      </span>
                      {row.mtime ? (
                        <span className="tabular hidden shrink-0 text-[0.6875rem] text-muted @min-[32rem]:block">
                          {formatWhen(new Date(row.mtime).toISOString())}
                        </span>
                      ) : null}
                      <span className="tabular w-20 shrink-0 text-right text-[0.6875rem] text-muted">
                        {formatSize(row.size)}
                      </span>
                      <ExternalLink
                        className={cn(
                          'h-3.5 w-3.5 shrink-0 text-muted opacity-0',
                          'group-hover:opacity-100 group-focus-visible:opacity-100',
                        )}
                      />
                    </a>
                  ),
                )
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-subtle px-3 py-1 text-[0.6875rem] text-muted">
              {/* "Items", not "files": the count includes the folders the
                  archive declares, which are listed here as rows like any other. */}
              <span className="tabular">
                {data.total.toLocaleString()} item{data.total === 1 ? '' : 's'} in this archive
              </span>
              {data.hasMore ? (
                <span>· showing the first {data.entries.length.toLocaleString()}</span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </ViewerChrome>
  );
}

interface Row {
  /** Full path inside the archive, so it can be requested or descended into. */
  name: string;
  isDirectory: boolean;
  size: number;
  mtime: number;
  /** Members beneath a folder row. */
  count: number;
}

/**
 * The direct children of one folder inside the archive.
 *
 * Folders are inferred rather than read: an archive is a flat list of paths, and
 * many are written without directory entries at all, so `a/b/c.png` has to be
 * enough to produce the folder `a`. While a filter is typed the tree is set aside
 * and every matching file is listed with its full path, because searching a zip
 * for a filename is not something you want to do one folder at a time.
 */
function childrenOf(entries: ArchiveEntry[], folder: string, filter: string): Row[] {
  const needle = filter.trim().toLowerCase();
  if (needle) {
    return entries
      .filter(entry => !entry.isDirectory && entry.name.toLowerCase().includes(needle))
      .slice(0, 500)
      .map(entry => ({
        name: entry.name,
        isDirectory: false,
        size: entry.size,
        mtime: entry.mtime,
        count: 0,
      }));
  }

  const prefix = folder ? `${folder}/` : '';
  const folders = new Map<string, number>();
  const files: Row[] = [];

  for (const entry of entries) {
    if (!entry.name.startsWith(prefix)) continue;
    const rest = entry.name.slice(prefix.length);
    if (rest === '') continue;

    const cut = rest.indexOf('/');
    if (cut === -1) {
      if (entry.isDirectory) folders.set(prefix + rest, folders.get(prefix + rest) ?? 0);
      else {
        files.push({
          name: entry.name,
          isDirectory: false,
          size: entry.size,
          mtime: entry.mtime,
          count: 0,
        });
      }
      continue;
    }

    const child = prefix + rest.slice(0, cut);
    folders.set(child, (folders.get(child) ?? 0) + (entry.isDirectory ? 0 : 1));
  }

  return [
    ...[...folders].map(([name, count]) => ({
      name,
      isDirectory: true,
      size: 0,
      mtime: 0,
      count,
    })),
    ...files,
  ];
}

function InnerBreadcrumb({
  folder,
  onNavigate,
}: {
  folder: string;
  onNavigate: (folder: string) => void;
}) {
  const parts = folder ? folder.split('/') : [];

  return (
    <nav aria-label="Location inside the archive" className="flex min-w-0 items-center text-xs">
      <button
        type="button"
        onClick={() => onNavigate('')}
        className={cn('shrink-0 hover:text-primary', folder ? 'text-muted' : 'text-primary')}
      >
        <FileArchive className="h-4 w-4" />
      </button>
      {parts.map((part, index) => (
        <span key={index} className="flex min-w-0 items-center">
          <ChevronRight className="h-3 w-3 shrink-0 text-muted" />
          <button
            type="button"
            onClick={() => onNavigate(parts.slice(0, index + 1).join('/'))}
            className={cn(
              'truncate hover:text-primary',
              index === parts.length - 1 ? 'text-primary' : 'text-muted',
            )}
          >
            {part}
          </button>
        </span>
      ))}
    </nav>
  );
}

function basename(name: string): string {
  const cut = name.lastIndexOf('/');
  return cut === -1 ? name : name.slice(cut + 1);
}
