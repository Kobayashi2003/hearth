import type { FileEntry } from '@hearth/shared';

import { api } from '@/lib/api';
import { formatExactWhen, formatKind, formatSize, parentOf } from '@/lib/format';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { NameDialog } from '@/ui/NameDialog';
import type { FileOperations } from './useFileOperations';

export type DialogState =
  | { kind: 'none' }
  | { kind: 'new-folder' }
  | { kind: 'rename'; entry: FileEntry }
  | { kind: 'delete'; entries: FileEntry[] }
  | { kind: 'details'; entry: FileEntry };

export function ExplorerDialogs({
  state,
  onClose,
  currentPath,
  operations,
  trashEnabled,
}: {
  state: DialogState;
  onClose: () => void;
  currentPath: string;
  operations: FileOperations;
  trashEnabled: boolean;
}) {
  return (
    <>
      <NameDialog
        open={state.kind === 'new-folder'}
        title="New folder"
        action="Create folder"
        initial=""
        onClose={onClose}
        onSubmit={name =>
          operations.run(`Created “${name}”`, () => api.makeDirectory(currentPath, name))
        }
      />
      <NameDialog
        open={state.kind === 'rename'}
        title="Rename"
        action="Rename"
        initial={state.kind === 'rename' ? state.entry.name : ''}
        onClose={onClose}
        onSubmit={name =>
          state.kind === 'rename'
            ? operations.run(`Renamed to “${name}”`, () => api.rename(state.entry.path, name))
            : undefined
        }
      />
      <DeleteDialog
        entries={state.kind === 'delete' ? state.entries : []}
        open={state.kind === 'delete'}
        trashEnabled={trashEnabled}
        onClose={onClose}
        onConfirm={(entries, permanent) =>
          operations.run(
            permanent ? `Deleted ${entries.length}` : `Moved ${entries.length} to the recycle bin`,
            () =>
              api.remove(
                entries.map(entry => entry.path),
                permanent,
              ),
          )
        }
      />
      <DetailsDialog entry={state.kind === 'details' ? state.entry : null} onClose={onClose} />
    </>
  );
}

function DeleteDialog({
  entries,
  open,
  trashEnabled,
  onClose,
  onConfirm,
}: {
  entries: FileEntry[];
  open: boolean;
  trashEnabled: boolean;
  onClose: () => void;
  onConfirm: (entries: FileEntry[], permanent: boolean) => void;
}) {
  const what = entries.length === 1 ? `“${entries[0]!.name}”` : `${entries.length} items`;
  const confirm = (permanent: boolean) => {
    onConfirm(entries, permanent);
    onClose();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onClose()}
      title={trashEnabled ? `Move ${what} to the recycle bin?` : `Delete ${what}?`}
      description={
        trashEnabled
          ? 'You can restore it from Settings → Recycle bin until it is emptied.'
          : 'The recycle bin is off, so this cannot be undone.'
      }
      footer={
        <>
          {trashEnabled ? (
            // Apart from the safe pair on the right, so it is never hit by habit.
            <Button
              variant="quiet"
              className="text-danger sm:-ml-3 sm:mr-auto"
              onClick={() => confirm(true)}
            >
              Delete permanently
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" autoFocus onClick={() => confirm(!trashEnabled)}>
            {trashEnabled ? 'Move to recycle bin' : 'Delete'}
          </Button>
        </>
      }
    />
  );
}

function DetailsDialog({ entry, onClose }: { entry: FileEntry | null; onClose: () => void }) {
  const rows: Array<[string, string]> = entry
    ? [
        ['Kind', formatKind(entry)],
        [
          'Size',
          entry.isDirectory
            ? '—'
            : `${formatSize(entry.size)} (${entry.size.toLocaleString()} bytes)`,
        ],
        ['Modified', formatExactWhen(entry.mtime)],
        ['Folder', `/${parentOf(entry.path)}`],
        ['Type', entry.mimeType],
      ]
    : [];
  return (
    <Dialog
      open={entry !== null}
      onOpenChange={next => !next && onClose()}
      title={entry?.name ?? ''}
    >
      <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-2.5 pb-5 text-[13.5px]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink-3">{label}</dt>
            <dd className="break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
