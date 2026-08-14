import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckSquare } from 'lucide-react';
import type { Progress } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatKind, formatSize, formatWhen } from '@/lib/format';
import type { EntryAction } from '../useEntryActions';
import type { PeekTarget } from './usePeek';

const CARD_WIDTH = 268;
/** Kept off the item itself so the card never sits under the cursor. */
const GAP_PX = 10;
const MARGIN_PX = 8;

/**
 * The Peek card: what a file is, without opening it.
 *
 * On a fine pointer this is information only — right-click already carries the
 * actions. On a coarse pointer it carries both, because long-press is the only
 * gesture available and it has to do the work of hover *and* right-click.
 */
export function PeekCard({
  target,
  progress,
  actions,
  onClose,
  onSelect,
}: {
  target: PeekTarget;
  progress: Progress | undefined;
  /** The same declaration the right-click menu renders — see useEntryActions. */
  actions: EntryAction[];
  onClose: () => void;
  onSelect: (index: number) => void;
}) {
  const { entry, anchor, withActions, withPicture } = target;
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Measured before paint: a card that appears in the wrong place and then
  // jumps is worse than one that appears a frame later.
  useLayoutEffect(() => {
    const height = cardRef.current?.offsetHeight ?? 240;
    const room = window.innerWidth - anchor.right;

    const left =
      room >= CARD_WIDTH + GAP_PX + MARGIN_PX
        ? anchor.right + GAP_PX
        : Math.max(MARGIN_PX, anchor.left - CARD_WIDTH - GAP_PX);

    const top = Math.min(
      Math.max(MARGIN_PX, anchor.top),
      Math.max(MARGIN_PX, window.innerHeight - height - MARGIN_PX),
    );

    setPosition({ top, left: Math.min(left, window.innerWidth - CARD_WIDTH - MARGIN_PX) });
  }, [anchor]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <>
      {/* On touch the card is modal enough to need a way out that is not a
          precise tap on the item behind it. */}
      {withActions ? (
        <div className="fixed inset-0 z-[60] bg-[var(--scrim)]" onPointerDown={onClose} aria-hidden />
      ) : null}

      <div
        ref={cardRef}
        role={withActions ? 'dialog' : 'tooltip'}
        aria-label={entry.name}
        style={{
          width: CARD_WIDTH,
          top: position?.top ?? -9999,
          left: position?.left ?? -9999,
          visibility: position ? 'visible' : 'hidden',
        }}
        className={cn(
          'fixed z-[61] overflow-hidden rounded-xl border border-subtle bg-overlay shadow-2xl',
          'motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150',
          // Information-only: never intercept the pointer that summoned it.
          !withActions && 'pointer-events-none',
        )}
      >
        {/* `w-full` keeps the width definite. With `width: auto`, `max-height`
            clamps the height and the aspect ratio then re-derives a narrower
            width — shrinking the box instead of cropping the picture. */}
        {withPicture ? (
          <div className="flex h-56 w-full items-center justify-center overflow-hidden bg-sunken">
            <img
              src={mediaUrls.thumbnail(entry.path, 480)}
              alt=""
              className="h-full w-full object-cover"
              onError={event => {
                event.currentTarget.style.display = 'none';
              }}
            />
          </div>
        ) : null}

        <div className={cn("p-3", withPicture && "border-t border-subtle")}>
          <p className="line-clamp-2 text-sm font-medium text-primary">{entry.name}</p>

          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[0.6875rem]">
            <dt className="text-muted">Kind</dt>
            <dd className="truncate text-secondary">{formatKind(entry)}</dd>
            {!entry.isDirectory ? (
              <>
                <dt className="text-muted">Size</dt>
                <dd className="tabular text-secondary">{formatSize(entry.size)}</dd>
              </>
            ) : null}
            <dt className="text-muted">Modified</dt>
            <dd className="tabular truncate text-secondary">{formatWhen(entry.mtime)}</dd>
          </dl>

          {progress ? (
            <div className="mt-2.5">
              <div className="h-1 overflow-hidden rounded-full bg-strong">
                <div className="h-full bg-accent" style={{ width: `${Math.max(3, progress.percent)}%` }} />
              </div>
              <p className="tabular mt-1 text-[0.6875rem] text-muted">{progress.percent}% read</p>
            </div>
          ) : null}
        </div>

        {withActions ? (
          <div className="grid grid-cols-2 gap-px border-t border-subtle bg-subtle">
            {/* Select has no equivalent on the right-click side — there, the
                click that opened the menu already selected the item. */}
            <PeekAction
              icon={CheckSquare}
              label="Select"
              onClick={() => onSelect(target.index)}
            />
            {actions.map(action => (
              <PeekAction
                key={action.id}
                icon={action.icon}
                label={action.label}
                danger={action.isDestructive}
                active={action.isActive}
                onClick={() => {
                  onClose();
                  action.run();
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </>,
    document.body,
  );
}

function PeekAction({
  icon: Icon,
  label,
  onClick,
  danger,
  active,
}: {
  icon: EntryAction['icon'];
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-tap items-center gap-2 bg-overlay px-3 text-xs',
        'hover:bg-sunken active:bg-sunken',
        danger ? 'text-danger' : active ? 'text-accent' : 'text-secondary',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', active && 'fill-current')} />
      {label}
    </button>
  );
}
