import { useEffect, useRef, useState } from 'react';
import { COMIC_EXTENSIONS, EPUB_EXTENSIONS, hasCoverArt, type FileEntry, type Progress } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';
import { cn } from '@/lib/cn';
import { coverBadgeFor, FileGlyph } from '@/components/FileGlyph';

/**
 * Covers are square. A grid holds folders, photos, videos and books alike, and
 * only one of those is printed in poster proportions — a 2:3 tile left a folder
 * icon floating in a tall empty box. The ratio is fixed across every device: it
 * is part of the product's identity, not something that adapts (ADR 0002).
 */
export const COVER_ASPECT = '1 / 1';

/**
 * A glyph stands in for a file with no picture, and in a square tile it can
 * afford to be big — a 32px icon in a 160px box reads as an accident.
 */
const GLYPH_SCALE = 0.34;

/**
 * Whether the picture may be cropped to fill its tile.
 *
 * A photograph or a video frame is a window: cropping it to a square loses some
 * scenery and nothing else. A book or comic cover is a designed object whose
 * title lives at the top — `object-cover` on a portrait cover in a square tile
 * slices the title clean off, which defeats the only reason to show a cover at
 * all. Those are fitted whole instead.
 */
function coverMayBeCropped(entry: FileEntry): boolean {
  const name = entry.name.toLowerCase();
  const extension = name.slice(name.lastIndexOf('.'));
  return !COMIC_EXTENSIONS.has(extension) && !EPUB_EXTENSIONS.has(extension);
}

/**
 * Thumbnails load only once the tile is near the viewport — a folder of ten
 * thousand photos would otherwise ask the server for ten thousand renders at
 * once.
 *
 * Focus and selection are drawn differently on purpose: a dashed outline says
 * "the keyboard is here", a solid ring plus a tinted name says "this will be
 * acted on". Ctrl+↑↓ moves the first without changing the second, and you have
 * to be able to see that happening.
 */
export function Cover({
  entry,
  showFolderCover,
  progress,
  isSelected,
  isFocused,
  labelInside,
}: {
  entry: FileEntry;
  /** Folder covers are opt-in; see the `folderCovers` preference. */
  showFolderCover: boolean;
  progress: Progress | undefined;
  isSelected: boolean;
  isFocused: boolean;
  /** Compact carries the name on the cover; comfortable captions it below. */
  labelInside: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isNearViewport, setNearViewport] = useState(false);
  const [failed, setFailed] = useState(false);

  const wantsCover = entry.isDirectory ? showFolderCover : hasCoverArt(entry);

  useEffect(() => {
    const element = ref.current;
    if (!element || !wantsCover) return;

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
  }, [entry, wantsCover]);

  const showImage = wantsCover && isNearViewport && !failed;

  // Only over an actual picture: without one the glyph in the middle of the tile
  // is already the type, and a second copy of it in the corner is noise.
  const Badge = showImage ? coverBadgeFor(entry) : null;

  return (
    <div
      ref={ref}
      style={{ aspectRatio: COVER_ASPECT }}
      className={cn(
        'relative flex items-center justify-center overflow-hidden rounded-density',
        // Outline colour is deliberately not animated — see the note in
        // FileList: it interpolates from `currentcolor` and flashes white.
        'transition-[box-shadow,background-color] duration-[var(--duration-instant)]',
        // Filled, not just outlined. The wash has to go on the tile itself:
        // behind it, the cover's own opaque background hides it completely,
        // and an outline alone is what focus already looks like.
        isSelected ? 'bg-accent-wash' : 'bg-sunken',
        isSelected && 'outline outline-2 outline-offset-2 outline-accent',
        isFocused && !isSelected && 'outline outline-2 outline-offset-2 outline-dashed outline-strong',
        !isSelected && !isFocused && 'group-hover:brightness-105',
      )}
    >
      {showImage ? (
        <img
          src={mediaUrls.thumbnail(entry.path, 320)}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className={cn(
            'h-full w-full',
            coverMayBeCropped(entry) ? 'object-cover' : 'object-contain',
          )}
        />
      ) : (
        <FileGlyph
          entry={entry}
          className={cn('text-muted', entry.isDirectory && 'text-accent')}
          style={{ width: `${GLYPH_SCALE * 100}%`, height: 'auto' }}
        />
      )}

      {/*
        What kind of thing this cover belongs to. Deliberately faint and small:
        it is there to be found when scanning a wall of covers for the videos,
        not to compete with the artwork it sits on. Top-left, the one corner
        neither the progress stripe nor the compact label ever uses.
      */}
      {Badge ? (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-1 top-1 rounded-md bg-black/35 p-1',
            'text-white/75 backdrop-blur-[1px]',
          )}
        >
          <Badge className="h-3.5 w-3.5" />
        </span>
      ) : null}

      {/*
        In compact the name rides on the cover, so a tile is exactly one square
        and the grid reads as a wall rather than a list of captions.

        The dark scrim only appears over an actual picture. Its whole job is to
        keep white text legible on an unpredictable photograph; laid over a plain
        glyph placeholder it is just a grey smudge across the bottom of an
        otherwise clean tile, so there the label sits on the surface instead.
      */}
      {labelInside ? (
        <span
          className={cn(
            'absolute inset-x-0 bottom-0 px-2 pb-1.5',
            showImage
              ? 'bg-gradient-to-t from-black/85 via-black/55 to-transparent pt-6'
              : 'bg-sunken pt-1',
          )}
        >
          <span
            className={cn(
              'line-clamp-2 text-[0.6875rem] leading-snug',
              showImage ? 'text-white' : isSelected ? 'text-accent' : 'text-secondary',
              isSelected && 'font-semibold',
            )}
            title={entry.name}
          >
            {entry.name}
          </span>
        </span>
      ) : null}

      {progress ? <ProgressStripe percent={progress.percent} /> : null}
    </div>
  );
}

/**
 * How far in you are, drawn on the cover itself. A finished item gets a full
 * bar rather than a badge — "done" and "one page left" should not look alike
 * at a glance across a wall of covers.
 */
function ProgressStripe({ percent }: { percent: number }) {
  return (
    <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/45">
      <div
        className="h-full bg-accent"
        style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Reading progress"
      />
    </div>
  );
}
