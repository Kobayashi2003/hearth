import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';

import { cn } from '@/lib/cn';
import { filterCommands, type Command } from './commands';

/**
 * The command palette. Every action is reachable by typing its name, which is
 * what makes the rarely-used ones discoverable without crowding the toolbar.
 */
export function CommandPalette({
  commands,
  open,
  onOpenChange,
}: {
  commands: Command[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [term, setTerm] = useState('');
  const [highlighted, setHighlighted] = useState(0);

  const matches = useMemo(() => filterCommands(commands, term), [commands, term]);

  useEffect(() => {
    if (open) {
      setTerm('');
      setHighlighted(0);
    }
  }, [open]);

  useEffect(() => setHighlighted(0), [term]);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted(index => Math.min(matches.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted(index => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const command = matches[highlighted];
      if (command) {
        onOpenChange(false);
        command.run();
      }
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[--scrim]" />
        <Dialog.Content
          onKeyDown={handleKeyDown}
          className={cn(
            'fixed left-1/2 top-[12vh] z-50 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2',
            'overflow-hidden rounded-xl border border-subtle bg-overlay shadow-2xl',
          )}
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>

          <div className="flex items-center gap-2 border-b border-subtle px-3">
            <Search className="h-4 w-4 shrink-0 text-muted" />
            <input
              value={term}
              onChange={event => setTerm(event.target.value)}
              placeholder="Search for an action…"
              autoFocus
              aria-label="Search for an action"
              className="h-11 w-full bg-transparent text-sm text-primary outline-none placeholder:text-muted"
            />
          </div>

          <ul className="max-h-[min(24rem,60vh)] overflow-y-auto p-1.5">
            {matches.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted">No matching action</li>
            ) : (
              matches.map((command, index) => {
                const Icon = command.icon;
                return (
                  <li key={command.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        command.run();
                      }}
                      onPointerMove={() => setHighlighted(index)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm',
                        index === highlighted ? 'bg-sunken text-primary' : 'text-secondary',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted" />
                      <span className="flex-1 truncate">{command.label}</span>
                      <span className="eyebrow shrink-0">{command.group}</span>
                      {command.shortcut ? <Kbd>{command.shortcut}</Kbd> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-subtle bg-sunken px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted">
      {children}
    </kbd>
  );
}

/** The same registry, laid out as reference rather than as a launcher. */
export function ShortcutsDialog({
  commands,
  open,
  onOpenChange,
}: {
  commands: Command[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const groups = useMemo(() => {
    const bound = commands.filter(command => command.shortcut);
    return [...new Map(bound.map(c => [c.group, bound.filter(x => x.group === c.group)]))];
  }, [commands]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[--scrim]" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2',
            '-translate-y-1/2 rounded-xl border border-subtle bg-overlay p-5 shadow-2xl',
          )}
        >
          <Dialog.Title className="text-base font-semibold text-primary">
            Keyboard shortcuts
          </Dialog.Title>

          <div className="mt-4 max-h-[60vh] space-y-5 overflow-y-auto">
            {groups.map(([group, items]) => (
              <section key={group}>
                <h3 className="eyebrow mb-2">{group}</h3>
                <dl className="space-y-1">
                  {items.map(command => (
                    <div key={command.id} className="flex items-center justify-between gap-4">
                      <dt className="text-sm text-secondary">{command.label}</dt>
                      <dd>
                        <Kbd>{command.shortcut}</Kbd>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
