import { useState } from 'react';
import { hasCoverArt, type FileEntry, type Progress } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';
import { cn } from '@/lib/cn';
import { iconFor } from '@/lib/file-kind';

/** The picture of a file where it has one, its type icon otherwise. */
export function EntryVisual({
  entry,
  width,
  folderCovers,
  className,
  iconClassName,
}: {
  entry: FileEntry;
  /** Requested thumbnail width; 0 means icon only. */
  width: number;
  folderCovers: boolean;
  className?: string;
  iconClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const Icon = iconFor(entry);
  const wantsPicture =
    width > 0 && !failed && (hasCoverArt(entry) || (entry.isDirectory && folderCovers));

  return (
    <span className={cn('relative grid place-items-center overflow-hidden', className)}>
      {wantsPicture ? (
        <img
          src={mediaUrls.thumbnail(entry.path, width)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
      <Icon
        aria-hidden
        className={cn(
          'shrink-0',
          entry.isDirectory ? 'fill-glaze/15 text-glaze' : 'text-ink-3',
          wantsPicture && 'invisible',
          iconClassName,
        )}
        strokeWidth={1.6}
      />
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
