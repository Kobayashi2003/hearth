import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/cn';
import { menuItem, menuSurface } from '@/ui/Menu';
import type { EntryAction } from './actions';

/** A menu at the pointer, flipped when it would run off an edge. */
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
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(8, x + width > window.innerWidth - 8 ? x - width : x),
      top: Math.max(8, y + height > window.innerHeight - 8 ? y - height : y),
    });
    menu.querySelector<HTMLButtonElement>('button')?.focus();
  }, [x, y]);

  useEffect(() => {
    const dismiss = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
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

  return createPortal(
    <div ref={ref} role="menu" className={cn(menuSurface, 'fixed w-56')} style={position}>
      <p className="truncate px-2.5 pb-1.5 pt-1 text-[12px] text-ink-3">{title}</p>
      {actions.map(action => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              action.run();
            }}
            className={cn(
              menuItem,
              'focus:bg-sunken',
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
      })}
    </div>,
    document.body,
  );
}
