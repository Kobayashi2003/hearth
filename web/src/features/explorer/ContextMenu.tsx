import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useCoarsePointer, useIsCompact } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import { menuItem, menuSurface } from '@/ui/Menu';
import type { EntryAction } from './actions';

/**
 * A menu at the pointer, flipped when it would run off an edge. On a phone it
 * is a sheet from the bottom instead: a finger is not a pointer to open at,
 * and the rows want to be big enough to hit.
 */
export function ContextMenu({
  x,
  y,
  title,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  title: string;
  actions: EntryAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const scrimPressed = useRef(false);
  const [position, setPosition] = useState({ left: x, top: y });
  const coarse = useCoarsePointer();
  const compact = useIsCompact();
  const sheet = coarse && compact;

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    if (sheet) {
      menu.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
      return;
    }
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(8, x + width > window.innerWidth - 8 ? x - width : x),
      top: Math.max(8, y + height > window.innerHeight - 8 ? y - height : y),
    });
    menu.querySelector<HTMLButtonElement>('button')?.focus();
  }, [x, y, sheet]);

  useEffect(() => {
    // The sheet's scrim closes on its own click, so that click does not fall through to a file.
    const dismiss = (event: Event) => {
      const target = event.target as Element;
      if (!ref.current?.contains(target) && !target.closest?.('[data-sheet-scrim]')) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        items[
          (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        ]?.focus();
      }
    };
    // Deferred so the event that opened the menu does not close it.
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', dismiss);
      window.addEventListener('blur', onClose);
      window.addEventListener('resize', onClose);
    });
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  const items = actions.map(action => (
    <MenuButton
      key={action.id}
      action={action}
      large={sheet}
      onPick={() => {
        onClose();
        action.run();
      }}
    />
  ));

  if (sheet) {
    return createPortal(
      <>
        <div
          data-sheet-scrim
          aria-hidden
          // Only a tap that starts here closes the sheet: lifting the finger from the long press
          // that opened it also ends in a click, on the scrim now under it.
          onPointerDown={() => (scrimPressed.current = true)}
          onClick={() => scrimPressed.current && onClose()}
          className="animate-fade fixed inset-0 z-50 bg-[var(--scrim)]"
        />
        <div
          ref={ref}
          role="menu"
          className="animate-rise fixed inset-x-0 bottom-0 z-50 max-h-[75dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface px-2 pb-[calc(0.5rem+var(--safe-bottom))] pt-2 shadow-float"
        >
          <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
          <p className="truncate px-3 pb-2 text-[13px] font-medium text-ink-2">{title}</p>
          {items}
        </div>
      </>,
      document.body,
    );
  }

  return createPortal(
    <div ref={ref} role="menu" className={cn(menuSurface, 'fixed w-56')} style={position}>
      <p className="truncate px-2.5 pb-1.5 pt-1 text-[12px] text-ink-3">{title}</p>
      {items}
    </div>,
    document.body,
  );
}

function MenuButton({
  action,
  large,
  onPick,
}: {
  action: EntryAction;
  large: boolean;
  onPick: () => void;
}) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onPick}
      className={cn(
        menuItem,
        'focus:bg-sunken',
        large && 'h-12 gap-3 px-3 text-[15px] [&_svg]:size-5',
        action.danger && 'text-danger [&_svg]:text-danger',
      )}
    >
      <Icon />
      <span className="flex-1">{action.label}</span>
      {action.shortcut ? (
        <kbd className="font-sans text-[11px] text-ink-3 [@media(pointer:coarse)]:hidden">
          {action.shortcut}
        </kbd>
      ) : null}
    </button>
  );
}
