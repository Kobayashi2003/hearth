import { X } from 'lucide-react';
import type { FileEntry } from '@hearth/shared';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { mediaUrls } from '@/lib/api';
import { formatSize } from '@/lib/format';
import { useAtLeast } from '@/hooks/useBreakpoint';

/**
 * What else is queued up in this folder.
 *
 * The list is the gallery the viewer was opened with, which is already filtered
 * to one medium — a video playlist holds videos, not the spreadsheets that
 * happened to be filed beside them.
 *
 * A wide screen gets a column beside the picture; a phone gets a sheet, because
 * a 18rem column on a 390px screen is the picture.
 */
export function VideoPlaylist({
  items,
  currentPath,
  onSelect,
  onClose,
}: {
  items: FileEntry[];
  currentPath: string;
  onSelect: (entry: FileEntry) => void;
  onClose: () => void;
}) {
  const asSidebar = useAtLeast('wide');

  const list = (
    <ol className="min-h-0 flex-1 overflow-y-auto py-1">
      {items.map((entry, index) => {
        const isCurrent = entry.path === currentPath;
        return (
          <li key={entry.path}>
            <button
              type="button"
              onClick={() => onSelect(entry)}
              aria-current={isCurrent}
              className={cn(
                'flex min-h-tap w-full items-center gap-2.5 px-3 py-1.5 text-left',
                isCurrent ? 'bg-accent-wash' : 'hover:bg-sunken',
              )}
            >
              <span className="tabular w-5 shrink-0 text-right text-[0.6875rem] text-muted">
                {index + 1}
              </span>
              <span className="relative h-9 w-16 shrink-0 overflow-hidden rounded bg-sunken">
                <img
                  src={mediaUrls.thumbnail(entry.path, 160)}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                  onError={event => {
                    event.currentTarget.style.visibility = 'hidden';
                  }}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'line-clamp-2 text-xs leading-snug',
                    isCurrent ? 'font-medium text-accent' : 'text-primary',
                  )}
                  title={entry.name}
                >
                  {entry.name}
                </span>
                <span className="tabular mt-0.5 block text-[0.625rem] text-muted">
                  {formatSize(entry.size)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  const header = (
    <div className="flex shrink-0 items-center justify-between border-b border-subtle px-3 py-2">
      <h3 className="text-sm font-medium text-primary">
        Up next <span className="tabular ml-1 text-xs text-muted">{items.length}</span>
      </h3>
      <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close the playlist">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );

  if (asSidebar) {
    return (
      <aside
        aria-label="Playlist"
        data-chrome
        className="flex w-72 shrink-0 flex-col border-l border-subtle bg-overlay"
      >
        {header}
        {list}
      </aside>
    );
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[var(--scrim)]" data-chrome>
      <button type="button" className="flex-1" aria-label="Close the playlist" onClick={onClose} />
      <div
        aria-label="Playlist"
        className={cn(
          'flex max-h-[70%] flex-col overflow-hidden rounded-t-2xl border-t border-subtle bg-overlay',
          'motion-safe:animate-in motion-safe:slide-in-from-bottom-4',
        )}
      >
        {header}
        {list}
      </div>
    </div>
  );
}
