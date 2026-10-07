import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export const menuSurface =
  'z-50 min-w-44 rounded-xl border border-line bg-surface p-1 text-[13px] shadow-float animate-rise data-[state=closed]:animate-sink';
export const menuItem =
  'flex h-8 w-full select-none items-center gap-2.5 rounded-lg px-2.5 text-left text-ink outline-none ' +
  'data-[highlighted]:bg-sunken hover:bg-sunken data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:text-ink-3';

export function Menu({
  trigger,
  children,
  align = 'end',
  side,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <Dropdown.Root modal={false}>
      <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={8}
          // Long lists scroll instead of running off screen.
          className={cn(
            menuSurface,
            'scroll-thin max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto',
          )}
        >
          {children}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

export function MenuItem({
  icon,
  children,
  onSelect,
  danger,
  shortcut,
  disabled,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  shortcut?: string;
  disabled?: boolean;
}) {
  return (
    <Dropdown.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(menuItem, danger && 'text-danger [&_svg]:text-danger')}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? <kbd className="font-sans text-[11px] text-ink-3">{shortcut}</kbd> : null}
    </Dropdown.Item>
  );
}

/**
 * One of several options. The menu stays open by default so related settings
 * can be changed together; `closes` is for a choice that moves you elsewhere.
 */
export function MenuChoice({
  checked,
  children,
  onSelect,
  closes = false,
  disabled,
}: {
  checked: boolean;
  children: ReactNode;
  onSelect: () => void;
  closes?: boolean;
  disabled?: boolean;
}) {
  return (
    <Dropdown.Item
      disabled={disabled}
      onSelect={event => {
        if (!closes) event.preventDefault();
        onSelect();
      }}
      className={menuItem}
    >
      <span className="grid size-4 place-items-center">
        {checked ? <Check className="!text-glaze" /> : null}
      </span>
      <span className="flex-1">{children}</span>
    </Dropdown.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <Dropdown.Label className="px-2.5 pb-1 pt-2 text-[12px] font-medium text-ink-3">
      {children}
    </Dropdown.Label>
  );
}

export function MenuSeparator() {
  return <Dropdown.Separator className="mx-1 my-1 h-px bg-line" />;
}
