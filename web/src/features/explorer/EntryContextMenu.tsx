import { useEffect, useRef } from 'react';
import {
  Copy,
  Download,
  Eye,
  FolderOpen,
  Pencil,
  Scissors,
  Trash2,
} from 'lucide-react';
import type { FileEntry } from '@hearth/shared';

import { cn } from '@/lib/cn';
import { isPreviewable } from '@/features/mantel/viewerFor';

interface MenuAction {
  label: string;
  icon: typeof Copy;
  run: () => void;
  isAvailable: boolean;
  isDestructive?: boolean;
}

/**
 * Right-click menu. Positioned at the pointer and flipped when it would run off
 * an edge, so it stays usable near the bottom of a long list.
 */
export function EntryContextMenu({
  entry,
  position,
  selectionCount,
  canWrite,
  canDelete,
  onClose,
  onOpen,
  onPreview,
  onRename,
  onCopy,
  onCut,
  onDownload,
  onDelete,
}: {
  entry: FileEntry;
  position: { x: number; y: number };
  selectionCount: number;
  canWrite: boolean;
  canDelete: boolean;
  onClose: () => void;
  onOpen: () => void;
  onPreview: () => void;
  onRename: () => void;
  onCopy: () => void;
  onCut: () => void;
  onDownload: () => void;
  onDelete: () => void;
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

  const actions: MenuAction[] = [
    {
      label: entry.isDirectory ? 'Open' : 'Open',
      icon: entry.isDirectory ? FolderOpen : Eye,
      run: onOpen,
      isAvailable: !isMultiple,
    },
    {
      label: 'Preview',
      icon: Eye,
      run: onPreview,
      isAvailable: !isMultiple && isPreviewable(entry),
    },
    { label: 'Download', icon: Download, run: onDownload, isAvailable: true },
    { label: 'Copy', icon: Copy, run: onCopy, isAvailable: canWrite },
    { label: 'Cut', icon: Scissors, run: onCut, isAvailable: canWrite },
    { label: 'Rename', icon: Pencil, run: onRename, isAvailable: canWrite && !isMultiple },
    { label: 'Delete', icon: Trash2, run: onDelete, isAvailable: canDelete, isDestructive: true },
  ];

  return (
    <div
      ref={menuRef}
      role="menu"
      className={cn(
        'fixed z-50 min-w-44 rounded-lg border border-subtle bg-overlay p-1 text-sm shadow-xl',
      )}
      style={{ left: position.x, top: position.y }}
    >
      {isMultiple ? (
        <p className="eyebrow px-2 py-1.5">{selectionCount} items</p>
      ) : (
        <p className="truncate px-2 py-1.5 text-xs text-muted" title={entry.name}>
          {entry.name}
        </p>
      )}

      {actions
        .filter(action => action.isAvailable)
        .map(action => {
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
                action.isDestructive ? 'text-[--color-danger]' : 'text-secondary hover:text-primary',
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
