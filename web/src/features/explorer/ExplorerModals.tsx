import { api } from '@/lib/api';
import { SettingsDialog } from '@/features/admin/SettingsDialog';
import { CommandPalette, ShortcutsDialog } from './CommandPalette';
import { ConfirmDialog, NameDialog } from './dialogs';
import type { Command } from './commands';

export type OpenDialog = 'none' | 'newFolder' | 'rename' | 'delete' | 'shortcuts' | 'settings';

/**
 * Every overlay the explorer can raise, in one place: the command palette, the
 * shortcuts and settings dialogs, and the create/rename/delete prompts. Kept out
 * of `ExplorerPage` so that component stays a readable orchestrator.
 */
export function ExplorerModals({
  commands,
  dialog,
  setDialog,
  isPaletteOpen,
  setPaletteOpen,
  currentPath,
  selectedName,
  selectedPath,
  deleteCount,
  runOperation,
  deleteSelection,
}: {
  commands: Command[];
  dialog: OpenDialog;
  setDialog: (dialog: OpenDialog) => void;
  isPaletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  currentPath: string;
  selectedName: string | undefined;
  selectedPath: string | undefined;
  deleteCount: number;
  runOperation: (label: string, operation: () => Promise<unknown>) => void;
  deleteSelection: () => void;
}) {
  const close = (open: boolean, self: OpenDialog) => setDialog(open ? self : 'none');

  return (
    <>
      <CommandPalette commands={commands} open={isPaletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsDialog
        commands={commands}
        open={dialog === 'shortcuts'}
        onOpenChange={open => close(open, 'shortcuts')}
      />
      <SettingsDialog open={dialog === 'settings'} onOpenChange={open => close(open, 'settings')} />

      <NameDialog
        open={dialog === 'newFolder'}
        onOpenChange={open => close(open, 'newFolder')}
        title="New folder"
        label="Folder name"
        confirmLabel="Create"
        onConfirm={name => runOperation('Folder created', () => api.makeDirectory(currentPath, name))}
      />

      <NameDialog
        open={dialog === 'rename'}
        onOpenChange={open => close(open, 'rename')}
        title="Rename"
        label="New name"
        initialValue={selectedName ?? ''}
        confirmLabel="Rename"
        onConfirm={name => {
          if (selectedPath) runOperation('Renamed', () => api.rename(selectedPath, name));
        }}
      />

      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={open => close(open, 'delete')}
        title={`Delete ${deleteCount} item${deleteCount === 1 ? '' : 's'}?`}
        description="Deleted items go to the recycle bin, where you can restore them."
        confirmLabel="Delete"
        isDestructive
        onConfirm={deleteSelection}
      />
    </>
  );
}
