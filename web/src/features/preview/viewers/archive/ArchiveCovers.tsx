import { createElement } from 'react';
import type { FileEntry } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';
import { memberPath } from '@/lib/archive-path';
import { cn } from '@/lib/cn';
import { useThumbnail } from '@/lib/thumbnails';
import { hasPicture, iconOf, type Row } from './rows';

const TILE_WIDTH = 320;

/**
 * The archive's members as tiles, pictures drawn small. The first picture asked
 * for has the server unpack all of the archive's pictures in one reading (see
 * the administrator's "Open files inside archives"), so this view is chosen,
 * never the default.
 */
export function ArchiveCovers({
  archive,
  rows,
  pictures,
  onOpen,
}: {
  archive: FileEntry;
  rows: Row[];
  /** Whether the server opens files inside archives, which drawing them needs. */
  pictures: boolean;
  onOpen: (row: Row) => void;
}) {
  return (
    <ul className="scroll-thin grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] content-start gap-3 overflow-auto p-4">
      {rows.map(row => (
        <li key={row.path}>
          <button
            type="button"
            title={row.encrypted ? 'Password-protected' : row.name}
            onClick={() => onOpen(row)}
            className="group flex w-full flex-col gap-1.5 text-left"
          >
            <Tile archive={archive} row={row} drawn={pictures && hasPicture(row)} />
            <span className="line-clamp-2 break-all text-[12.5px] leading-snug text-ink-2 group-hover:text-ink">
              {row.name}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Tile({ archive, row, drawn }: { archive: FileEntry; row: Row; drawn: boolean }) {
  // The archive's version keys the picture: a changed archive is drawn again.
  const version = `${Date.parse(archive.mtime)}-${archive.size}`;
  const picture = useThumbnail(
    drawn ? mediaUrls.thumbnail(memberPath(archive.path, row.path), TILE_WIDTH, version) : null,
  );
  return (
    <span className="grid aspect-square place-items-center overflow-hidden rounded-xl bg-sunken ring-line group-hover:ring-1">
      {picture.src ? (
        <img
          src={picture.src}
          alt=""
          className={cn('size-full object-cover', !picture.instant && 'animate-fade')}
        />
      ) : (
        createElement(iconOf(row), { className: 'size-7 text-ink-3' })
      )}
    </span>
  );
}
