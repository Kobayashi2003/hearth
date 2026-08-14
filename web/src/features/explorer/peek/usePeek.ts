import { useCallback, useEffect, useRef, useState } from 'react';
import { hasCoverArt, type FileEntry } from '@hearth/shared';

import { useInputCapability } from '@/hooks/useInputCapability';

/** Something a Peek can actually show a picture of. */
function hasPicture(entry: FileEntry): boolean {
  return entry.isDirectory || hasCoverArt(entry);
}

/**
 * Peek — the long-press card on a touchscreen.
 *
 * Standing in for right-click, which is why it fires whatever the file is: the
 * menu is the point, and a menu that appears only for pictures would leave a
 * `.txt` with no actions at all on a phone.
 *
 * The fine-pointer counterpart is not this. Hovering raises `useHoverPreview`
 * instead — a plain thumbnail, images only — because a card of metadata beside a
 * row that already shows that metadata is just something in the way.
 */

/** The Android convention, and roughly where a press stops feeling like a tap. */
const LONG_PRESS_MS = 480;
/** A press that wanders this far is a scroll, not a long press. */
const MOVE_TOLERANCE_PX = 10;

export interface PeekTarget {
  entry: FileEntry;
  index: number;
  /** Where the item is, so the card can be placed beside it. */
  anchor: DOMRect;
  /** Coarse pointers get the action menu; fine pointers have right-click. */
  withActions: boolean;
  /** False for a file with nothing to show — the card renders text only. */
  withPicture: boolean;
}

export function usePeek() {
  const { coarse } = useInputCapability();
  const [target, setTarget] = useState<PeekTarget | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  /** Set when a long press fires, so the click it produces does not select. */
  const suppressClick = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pressOrigin.current = null;
  }, []);

  const close = useCallback(() => {
    cancel();
    setTarget(null);
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  // A scroll or a navigation must take the card with it, since its anchor has
  // moved out from under it.
  useEffect(() => {
    if (!target) return;
    const dismiss = () => close();
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [target, close]);

  const open = useCallback(
    (entry: FileEntry, index: number, element: HTMLElement) => {
      setTarget({
        entry,
        index,
        anchor: element.getBoundingClientRect(),
        withActions: coarse,
        // Long-press on a coarse pointer stands in for right-click, so it fires
        // whatever the file is; the card just drops its picture rather than
        // showing an empty grey box where a cover would be.
        withPicture: hasPicture(entry),
      });
    },
    [coarse],
  );

  /** Handlers to spread onto one item in a list or grid. */
  const handlersFor = useCallback(
    (entry: FileEntry, index: number) => ({
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType === 'mouse') return;
        const element = event.currentTarget;
        cancel();
        pressOrigin.current = { x: event.clientX, y: event.clientY };
        timer.current = setTimeout(() => {
          suppressClick.current = true;
          open(entry, index, element);
          // A long press that produces a card should feel like it landed.
          navigator.vibrate?.(12);
        }, LONG_PRESS_MS);
      },
      onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
        const origin = pressOrigin.current;
        if (!origin) return;
        const travelled =
          Math.abs(event.clientX - origin.x) + Math.abs(event.clientY - origin.y);
        if (travelled > MOVE_TOLERANCE_PX) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onContextMenu: (event: React.MouseEvent) => {
        // On touch the browser raises a context menu of its own after a long
        // press; ours has already taken over.
        if (suppressClick.current) event.preventDefault();
      },
    }),
    [cancel, open],
  );

  /**
   * True when the click now arriving was the tail of a long press. Reading it
   * clears the flag, so it can only swallow the one click it was set for.
   */
  const consumeSuppressedClick = useCallback(() => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  }, []);

  return { target, handlersFor, close, consumeSuppressedClick };
}
