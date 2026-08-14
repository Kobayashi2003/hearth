import { useEffect, useRef } from 'react';
import type { FileEntry } from '@hearth/shared';

import { menuContentClass } from '@/components/ui/Menu';
import { cn } from '@/lib/cn';
import type { EntryAction } from './useEntryActions';

/**
 * Right-click menu. Positioned at the pointer and flipped when it would run off
 * an edge, so it stays usable near the bottom of a long list.
 */
export function EntryContextMenu({
  entry,
  position,
  selectionCount,
  actions,
  onClose,
}: {
  entry: FileEntry;
  position: { x: number; y: number };
  selectionCount: number;
  /** Rendered from the shared declaration — see useEntryActions. */
  actions: EntryAction[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function dismiss(event: Event) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    // Deferred, so the click that opened the menu does not immediately close it.
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', dismiss);
      document.addEventListener('keydown', onKeyDown);
    });
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  // Flip rather than overflow when close to an edge.
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    if (position.x + bounds.width > window.innerWidth) {
      menu.style.left = `${Math.max(4, position.x - bounds.width)}px`;
    }
    if (position.y + bounds.height > window.innerHeight) {
      menu.style.top = `${Math.max(4, position.y - bounds.height)}px`;
    }
  }, [position]);

  const isMultiple = selectionCount > 1;

  return (
    <div
      ref={menuRef}
      role="menu"
      // The one menu surface, pinned to the pointer rather than to a trigger.
      className={cn(menuContentClass, 'fixed shadow-xl')}
      style={{ left: position.x, top: position.y }}
    >
      {isMultiple ? (
        <p className="eyebrow px-2 py-1.5">{selectionCount} items</p>
      ) : (
        <p className="truncate px-2 py-1.5 text-xs text-muted" title={entry.name}>
          {entry.name}
        </p>
      )}

      {actions.map(action => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              onClick={() => {
                onClose();
                action.run();
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left',
                'hover:bg-sunken',
                action.isDestructive ? 'text-[var(--color-danger)]' : 'text-secondary hover:text-primary',
              )}
            >
            <Icon className="h-4 w-4" />
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
