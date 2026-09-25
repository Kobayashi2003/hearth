import { ClipboardPaste, Ellipsis, X } from 'lucide-react';
import type { FileEntry } from '@hearth/shared';

import { cn } from '@/lib/cn';
import { formatSize } from '@/lib/format';
import { Button } from '@/ui/Button';
import { Menu, MenuItem } from '@/ui/Menu';
import type { EntryAction } from './actions';

/** On a phone only these stay on the bar; the rest move into "More". */
const ALWAYS_SHOWN = new Set(['download', 'delete']);

/** Floats at the bottom while something is selected or waiting on the clipboard. */
export function SelectionBar({
  entries,
  actions,
  clipboard,
  canPaste,
  onPaste,
  onCancelClipboard,
  onClear,
}: {
  entries: FileEntry[];
  actions: EntryAction[];
  clipboard: { paths: string[]; mode: 'copy' | 'cut' } | null;
  canPaste: boolean;
  onPaste: () => void;
  onCancelClipboard: () => void;
  onClear: () => void;
}) {
  if (entries.length === 0 && !clipboard) return null;
  const barActions = actions.filter(action => action.id !== 'open');
  const overflow = barActions.filter(action => !ALWAYS_SHOWN.has(action.id));
  const size = entries.reduce((sum, entry) => sum + entry.size, 0);

  return (
    <div
      className="animate-rise pointer-events-auto flex max-w-[calc(100vw-1.5rem)] items-center gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1.5 shadow-float [scrollbar-width:none]"
      onPointerDown={event => event.stopPropagation()}
    >
      {entries.length > 0 ? (
        <>
          <Button
            size="icon"
            onClick={onClear}
            aria-label="Clear selection"
            title="Clear selection (Esc)"
          >
            <X />
          </Button>
          <span className="tabular whitespace-nowrap px-1 text-[13px] font-medium">
            {entries.length}
            <span className="max-sm:hidden"> selected</span>
            {size > 0 ? (
              <span className="ml-1.5 font-normal text-ink-3 max-sm:hidden">
                {formatSize(size)}
              </span>
            ) : null}
          </span>
          <span className="mx-1 h-6 w-px shrink-0 bg-line" />
          {barActions.map(action => {
            const Icon = action.icon;
            return (
              <Button
                key={action.id}
                size="sm"
                onClick={action.run}
                aria-label={action.label}
                title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label}
                className={cn(
                  action.danger && 'text-danger hover:text-danger',
                  !ALWAYS_SHOWN.has(action.id) && 'max-sm:hidden',
                )}
              >
                <Icon />
                <span className="hidden md:inline">{action.label}</span>
              </Button>
            );
          })}
          {overflow.length > 0 ? (
            <span className="sm:hidden">
              <Menu
                side="top"
                trigger={
                  <Button size="icon" aria-label="More actions">
                    <Ellipsis />
                  </Button>
                }
              >
                {overflow.map(action => {
                  const Icon = action.icon;
                  return (
                    <MenuItem
                      key={action.id}
                      icon={<Icon />}
                      onSelect={action.run}
                      danger={action.danger}
                    >
                      {action.label}
                    </MenuItem>
                  );
                })}
              </Menu>
            </span>
          ) : null}
        </>
      ) : null}
      {clipboard ? (
        <>
          {entries.length > 0 ? <span className="mx-1 h-6 w-px shrink-0 bg-line" /> : null}
          <Button
            variant="primary"
            size="sm"
            onClick={onPaste}
            disabled={!canPaste}
            title="Paste (Ctrl+V)"
          >
            <ClipboardPaste />
            {clipboard.mode === 'cut' ? 'Move' : 'Paste'} {clipboard.paths.length} here
          </Button>
          <Button size="icon" onClick={onCancelClipboard} aria-label="Forget the copied items">
            <X />
          </Button>
        </>
      ) : null}
    </div>
  );
}
