import { useState } from 'react';
import { hasCoverArt, type FileEntry, type Progress } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';
import { cn } from '@/lib/cn';
import { iconFor, viewerKindFor } from '@/lib/file-kind';

const BADGE_SIZES = {
  grid: 'left-1.5 top-1.5 size-6 rounded-md [&>svg]:size-3.5',
  list: 'bottom-0 right-0 size-3.5 rounded-tl-[4px] [&>svg]:size-2.5',
} as const;

/**
 * The picture of a file where it has one, its type icon otherwise. A cover of
 * something that is not itself a picture (a video, a book, a folder) carries
 * its kind in a corner badge, or it would pass for an image.
 */
export function EntryVisual({
  entry,
  width,
  folderCovers,
  badge,
  className,
  iconClassName,
}: {
  entry: FileEntry;
  /** Requested thumbnail width; 0 means icon only. */
  width: number;
  folderCovers: boolean;
  badge?: keyof typeof BADGE_SIZES;
  className?: string;
  iconClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const Icon = iconFor(entry);
  const wantsPicture =
    width > 0 && !failed && (hasCoverArt(entry) || (entry.isDirectory && folderCovers));

  return (
    <span className={cn('relative grid place-items-center overflow-hidden', className)}>
      {wantsPicture ? (
        <img
          src={mediaUrls.thumbnail(entry.path, width, `${Date.parse(entry.mtime)}-${entry.size}`)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          // A cached image is complete on mount and skips the fade, so tiles
          // scrolled back into view do not flash.
          ref={image => {
            if (image?.complete && image.naturalWidth > 0) setLoaded(true);
          }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            'absolute inset-0 size-full object-cover transition-opacity duration-200',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : null}
      <Icon
        aria-hidden
        className={cn(
          'shrink-0',
          entry.isDirectory ? 'fill-glaze/15 text-glaze' : 'text-ink-3',
          wantsPicture && (loaded ? 'invisible' : 'opacity-35'),
          iconClassName,
        )}
        strokeWidth={1.6}
      />
      {wantsPicture && badge && viewerKindFor(entry) !== 'image' ? (
        <span
          aria-hidden
          className={cn(
            'absolute grid place-items-center bg-black/55 text-white backdrop-blur-sm',
            BADGE_SIZES[badge],
          )}
        >
          <Icon strokeWidth={2} />
        </span>
      ) : null}
    </span>
  );
}

/** Shown only for something started and not finished. */
export function ProgressBar({
  progress,
  className,
}: {
  progress: Progress | undefined;
  className?: string;
}) {
  if (!progress || progress.percent <= 0 || progress.percent >= 100) return null;
  return (
    <span
      className={cn('block h-[3px] overflow-hidden rounded-full bg-ink/10', className)}
      title={`${progress.percent}% through`}
    >
      <span
        className="block h-full rounded-full bg-ember"
        style={{ width: `${Math.max(3, progress.percent)}%` }}
      />
    </span>
  );
}
