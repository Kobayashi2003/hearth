import { useMemo, useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

export interface Command {
  id: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  commands,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: Command[];
}) {
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    return commands.filter(command =>
      words.every(word => command.label.toLowerCase().includes(word)),
    );
  }, [commands, text]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    onOpenChange(false);
    setText('');
    command.run();
  };

  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={next => {
        onOpenChange(next);
        if (!next) setText('');
        setActive(0);
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="animate-fade fixed inset-0 z-50 bg-[var(--scrim)] data-[state=closed]:animate-fade-out" />
        <RadixDialog.Content className="animate-rise data-[state=closed]:animate-sink fixed left-1/2 top-[14vh] z-50 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-float">
          <RadixDialog.Title className="sr-only">Commands</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">
            Type to find a command, Enter to run it.
          </RadixDialog.Description>
          <label className="flex items-center gap-3 border-b border-line px-4">
            <Search className="size-4 text-ink-3" />
            <input
              autoFocus
              value={text}
              onChange={event => {
                setText(event.target.value);
                setActive(0);
              }}
              onKeyDown={event => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  const delta = event.key === 'ArrowDown' ? 1 : -1;
                  setActive(
                    current => (current + delta + matches.length) % Math.max(1, matches.length),
                  );
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  run(matches[active]);
                }
              }}
              placeholder="What do you want to do?"
              className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
            />
          </label>
          <ul className="scroll-thin max-h-[50vh] overflow-auto p-1.5" role="listbox">
            {matches.length === 0 ? (
              <li className="px-3 py-6 text-center text-[13px] text-ink-3">
                No command matches “{text}”.
              </li>
            ) : null}
            {matches.map((command, index) => {
              const Icon = command.icon;
              return (
                <li key={command.id} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    onMouseMove={() => setActive(index)}
                    onClick={() => run(command)}
                    className={cn(
                      'flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[14px]',
                      index === active && 'bg-sunken',
                    )}
                  >
                    <Icon className="size-4 text-ink-3" />
                    <span className="flex-1">{command.label}</span>
                    {command.shortcut ? (
                      <kbd className="font-sans text-[11.5px] text-ink-3">{command.shortcut}</kbd>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
