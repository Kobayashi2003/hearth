import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookImage,
  ChevronLeft,
  ChevronRight,
  Download,
  FileArchive,
  Folder,
  Search,
} from 'lucide-react';
import type { ArchiveEntry } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';
import { api } from '@/lib/api';
import { iconFor } from '@/lib/file-kind';
import { formatSize } from '@/lib/format';
import { useKeyBindings } from '@/lib/keys';
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

  // The enlarged image steps through the images in view, in their listed order.
  const images = useMemo(
    () => rows.filter(row => !row.isDirectory && IMAGE.test(row.name)).map(row => row.path),
    [rows],
  );

  // Capture phase, ahead of the overlay: Escape in the search clears it rather
  // than closing the whole preview.
  useKeyBindings(
    [{ key: 'Escape', inFields: true, when: () => filter !== '', run: () => setFilter('') }],
    { capture: true },
  );

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
          {filter && data?.hasMore ? (
            <p className="border-b border-line bg-sunken px-4 py-1.5 text-[12.5px] text-ink-2">
              Only the {data.entries.length.toLocaleString()} listed items are searched.
            </p>
          ) : null}
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
                        className="grid size-7 place-items-center rounded-md text-ink-3 opacity-0 hover:bg-bg hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
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
        <ArchiveImage
          archive={entry.path}
          images={images}
          current={image}
          onShow={setImage}
          onClose={() => setImage(null)}
        />
      ) : null}
    </ViewerFrame>
  );
}

/**
 * An image from the archive, enlarged over the listing; it steps through the
 * images in view. Its keys take the capture phase, ahead of the overlay, so
 * Escape closes the image rather than the whole preview.
 */
function ArchiveImage({
  archive,
  images,
  current,
  onShow,
  onClose,
}: {
  archive: string;
  images: string[];
  current: string;
  onShow: (image: string) => void;
  onClose: () => void;
}) {
  const index = images.indexOf(current);
  const show = (delta: number) => {
    const next = images[index + delta];
    if (index !== -1 && next) onShow(next);
  };
  useKeyBindings(
    [
      { key: 'Escape', run: onClose },
      { key: 'ArrowLeft', run: () => show(-1) },
      { key: 'ArrowRight', run: () => show(1) },
    ],
    { capture: true },
  );

  return (
    <div className="animate-fade absolute inset-0 z-30 bg-stage/95">
      <button
        type="button"
        aria-label="Close image"
        onClick={onClose}
        className="absolute inset-0 grid place-items-center p-4"
      >
        <img
          src={mediaUrls.archiveEntry(archive, current)}
          alt={current}
          className="max-h-full max-w-full object-contain"
        />
      </button>
      {images.length > 1 ? (
        <>
          <Button
            variant="stage"
            size="icon"
            aria-label="Previous image"
            disabled={index <= 0}
            onClick={() => show(-1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="stage"
            size="icon"
            aria-label="Next image"
            disabled={index >= images.length - 1}
            onClick={() => show(1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45"
          >
            <ChevronRight />
          </Button>
          <p className="tabular absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-0.5 text-[12px] text-stage-ink">
            {index + 1} / {images.length}
          </p>
        </>
      ) : null}
    </div>
  );
}
