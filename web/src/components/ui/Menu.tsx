import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Minus, Plus } from 'lucide-react';

import { Button } from './Button';
import { cn } from '@/lib/cn';
import { neighbour } from '@/lib/steps';

/**
 * One dropdown surface for the whole application. Each menu still assembles its
 * own Radix parts — what goes in a menu is not worth abstracting — but they all
 * draw on the same box.
 */

export const menuContentClass = cn(
  'z-50 min-w-44 rounded-lg border border-subtle bg-overlay p-1 shadow-lg',
  'text-sm text-primary',
);

export const menuItemClass = cn(
  'flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 outline-none',
  'text-secondary data-[highlighted]:bg-sunken data-[highlighted]:text-primary',
);

export const menuSeparatorClass = 'my-1 h-px bg-[var(--border-subtle)]';

/** A heading over a run of related choices. */
export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu.Label className="eyebrow px-2 py-1 leading-snug">{children}</DropdownMenu.Label>
  );
}

/** One option in a set, ticked when it is the one in force. */
export function MenuChoice({
  label,
  hint,
  isCurrent,
  onSelect,
}: {
  label: string;
  hint?: string;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item className={cn(menuItemClass, 'items-start justify-between')} onSelect={onSelect}>
      <span className="min-w-0">
        <span className={cn('block text-[0.8125rem]', isCurrent && 'text-accent')}>{label}</span>
        {hint ? <span className="block text-[0.6875rem] text-muted">{hint}</span> : null}
      </span>
      {isCurrent ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" /> : null}
    </DropdownMenu.Item>
  );
}

/**
 * A value stepped along a list of presets. Deliberately not a `DropdownMenu.Item`:
 * an item would close the menu on the first press.
 */
export function MenuStepper<T extends number>({
  label,
  value,
  values,
  format,
  onChange,
  decreaseLabel,
  increaseLabel,
}: {
  label: string;
  value: T;
  values: T[];
  format: (value: T) => string;
  onChange: (value: T) => void;
  decreaseLabel: string;
  increaseLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-2 py-1">
      <span className="text-[0.8125rem] text-secondary">{label}</span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onChange(neighbour(values, value, -1))}
          aria-label={decreaseLabel}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <span className="tabular w-11 text-center text-xs text-secondary">{format(value)}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onChange(neighbour(values, value, 1))}
          aria-label={increaseLabel}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
