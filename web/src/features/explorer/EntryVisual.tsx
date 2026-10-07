import { useState } from 'react';
import { hasCoverArt, THUMBNAIL_REVISION, type FileEntry, type Progress } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';
import { useThumbnail } from '@/lib/thumbnails';
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
  const Icon = iconFor(entry);
  const picture = useTilePicture(thumbnailUrl(entry, width, folderCovers));
  const { thumbnail, shown, wantsPicture } = picture;
  return (
    <span className={cn('relative grid place-items-center overflow-hidden', className)}>
      {picture.drawable ? (
        <img
          src={thumbnail.src!}
          alt=""
          decoding="async"
          draggable={false}
          onLoad={picture.onLoad}
          onError={picture.onError}
          className={cn(
            'absolute inset-0 size-full object-cover',
            // One remembered from earlier in the session does not fade in again.
            !thumbnail.instant && 'transition-opacity duration-200',
            shown ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : null}
      <Icon
        aria-hidden
        className={cn(
          'shrink-0',
          entry.isDirectory ? 'fill-glaze/15 text-glaze' : 'text-ink-3',
          wantsPicture && (shown ? 'invisible' : 'opacity-35'),
          iconClassName,
        )}
        strokeWidth={1.6}
      />
      {shown && badge && viewerKindFor(entry) !== 'image' ? (
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

/**
 * The thumbnail and how far it has got. Load and decode failure are tracked per
 * picture: a tile handed another file must not show the new one before it
 * decodes, and one the browser cannot decode falls back to the icon, as if it
 * had never been there.
 */
function useTilePicture(url: string | null) {
  const thumbnail = useThumbnail(url);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const broken = thumbnail.src !== null && thumbnail.src === brokenSrc;
  return {
    thumbnail,
    drawable: thumbnail.src !== null && !broken,
    wantsPicture: !broken && (thumbnail.status === 'loading' || thumbnail.status === 'ready'),
    shown: thumbnail.status === 'ready' && (loadedSrc === thumbnail.src || thumbnail.instant),
    onLoad: () => setLoadedSrc(thumbnail.src),
    onError: () => setBrokenSrc(thumbnail.src),
  };
}

/** Where the tile's picture comes from, or null when it shows only its icon. */
function thumbnailUrl(entry: FileEntry, width: number, folderCovers: boolean): string | null {
  const hasPicture = hasCoverArt(entry) || (entry.isDirectory && folderCovers);
  if (width <= 0 || !hasPicture) return null;
  // The file's version lets the browser keep the picture until the file changes.
  const version = `${THUMBNAIL_REVISION}-${Date.parse(entry.mtime)}-${entry.size}`;
  return mediaUrls.thumbnail(entry.path, width, version);
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
