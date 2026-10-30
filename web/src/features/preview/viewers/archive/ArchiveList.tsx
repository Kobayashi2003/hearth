import { Download } from 'lucide-react';
import type { FileEntry } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';
import { formatSize } from '@/lib/format';
import { iconOf, type Row } from './rows';

/** The archive's members as rows: name, size, and a download for each file. */
export function ArchiveList({
  archive,
  rows,
  onOpen,
}: {
  archive: FileEntry;
  rows: Row[];
  onOpen: (row: Row) => void;
}) {
  return (
    <ul className="scroll-thin min-h-0 flex-1 overflow-auto py-1">
      {rows.map(row => {
        const Icon = iconOf(row);
        return (
          <li key={row.path} className="group flex h-row items-center gap-3 px-4 hover:bg-sunken">
            <Icon className="size-4 shrink-0 text-ink-3" />
            <button
              type="button"
              title={row.encrypted ? 'Password-protected' : undefined}
              className="min-w-0 flex-1 truncate text-left text-[13.5px]"
              onClick={() => onOpen(row)}
            >
              {row.name}
            </button>
            {!row.isDirectory ? (
              <>
                <span className="tabular text-[12px] text-ink-3">{formatSize(row.size)}</span>
                <a
                  href={mediaUrls.archiveEntry(archive.path, row.path)}
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
  );
}
