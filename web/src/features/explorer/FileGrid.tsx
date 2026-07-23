import { useEffect, useRef, useState } from 'react';
import type { FileEntry } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatSize } from '@/lib/format';
import { FileGlyph } from './FileGlyph';

const THUMBNAIL_MIME_PREFIXES = ['image/', 'video/'];

function hasThumbnail(entry: FileEntry): boolean {
  if (entry.isDirectory) return false;
  if (entry.name.toLowerCase().endsWith('.psd')) return true;
  return THUMBNAIL_MIME_PREFIXES.some(prefix => entry.mimeType.startsWith(prefix));
}

export function FileGrid({
  entries,
  selected,
  tileSize,
  onSelect,
  onOpen,
  onContextMenu,
}: {
  entries: FileEntry[];
  selected: ReadonlySet<string>;
  tileSize: number;
  onSelect: (path: string, index: number, modifiers: { ctrl?: boolean; shift?: boolean }) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (entry: FileEntry, event: React.MouseEvent) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-3" role="listbox" aria-label="Files">
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize}px, 1fr))` }}
      >
        {entries.map((entry, index) => (
          <button
            key={entry.path}
            type="button"
            role="option"
            aria-selected={selected.has(entry.path)}
            onClick={event =>
              onSelect(entry.path, index, {
                ctrl: event.ctrlKey || event.metaKey,
                shift: event.shiftKey,
              })
            }
            onDoubleClick={() => onOpen(entry)}
            onContextMenu={event => onContextMenu(entry, event)}
            className={cn(
              'group flex select-none flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors',
              'duration-[--duration-instant]',
              selected.has(entry.path)
                ? 'border-accent/50 bg-accent-wash'
                : 'border-transparent hover:border-subtle hover:bg-sunken',
            )}
          >
            <Thumbnail entry={entry} />
            <span className="truncate text-xs text-primary" title={entry.name}>
              {entry.name}
            </span>
            <span className="tabular truncate text-[0.6875rem] text-muted">
              {entry.isDirectory ? 'Folder' : formatSize(entry.size)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Thumbnails load only once the tile is near the viewport — a folder of ten
 * thousand photos would otherwise ask the server for ten thousand renders at
 * once.
 */
function Thumbnail({ entry }: { entry: FileEntry }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isNearViewport, setNearViewport] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || !hasThumbnail(entry)) return;

    const observer = new IntersectionObserver(
      ([observed]) => {
        if (observed?.isIntersecting) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [entry]);

  const showImage = hasThumbnail(entry) && isNearViewport && !failed;

  return (
    <div
      ref={ref}
      className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-sunken"
    >
      {showImage ? (
        <img
          src={mediaUrls.thumbnail(entry.path, 320)}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <FileGlyph entry={entry} className="h-8 w-8 text-muted" />
      )}
    </div>
  );
}
