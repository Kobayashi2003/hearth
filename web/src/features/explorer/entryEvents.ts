import { useRef, type MouseEvent, type PointerEvent } from 'react';
import type { FileEntry } from '@hearth/shared';

const LONG_PRESS_MS = 480;
const MOVE_TOLERANCE_PX = 10;
/** Long enough to tell a second click of a double-click from a separate click. */
const DOUBLE_CLICK_MS = 300;

export interface EntryHandlers {
  onPick: (entry: FileEntry, modifiers: { ctrl: boolean; shift: boolean }) => void;
  onOpen: (entry: FileEntry) => void;
  onMenu: (entry: FileEntry, x: number, y: number) => void;
  /** Clicking the one selected item again deselects it. */
  isOnlySelected: (entry: FileEntry) => boolean;
  onDeselect: () => void;
  /** On touch, a tap opens unless something is already selected, when it toggles instead. */
  isSelecting: boolean;
}

/**
 * Mouse: click selects (clicking the only selected item again clears it),
 * double-click opens, right-click opens the menu.
 * Touch: tap opens (or toggles while selecting), long-press opens the menu.
 */
export function useEntryEvents(handlers: EntryHandlers) {
  const press = useRef<{
    timer: number;
    x: number;
    y: number;
    fired: boolean;
    pointer: string;
  } | null>(null);
  const latest = useRef(handlers);
  latest.current = handlers;
  // A deselect waits to see whether the click is the first half of a double-click.
  const pendingDeselect = useRef<number | undefined>(undefined);
  const cancelDeselect = () => window.clearTimeout(pendingDeselect.current);

  return (entry: FileEntry) => ({
    'data-entry': '',
    onPointerDown(event: PointerEvent) {
      cancelDeselect();
      if (event.button !== 0) return;
      const state = {
        timer: 0,
        x: event.clientX,
        y: event.clientY,
        fired: false,
        pointer: event.pointerType,
      };
      if (event.pointerType !== 'mouse') {
        state.timer = window.setTimeout(() => {
          state.fired = true;
          navigator.vibrate?.(10);
          latest.current.onMenu(entry, state.x, state.y);
        }, LONG_PRESS_MS);
      }
      press.current = state;
    },
    onPointerMove(event: PointerEvent) {
      const state = press.current;
      if (
        state &&
        Math.hypot(event.clientX - state.x, event.clientY - state.y) > MOVE_TOLERANCE_PX
      ) {
        window.clearTimeout(state.timer);
      }
    },
    onPointerUp() {
      if (press.current) window.clearTimeout(press.current.timer);
    },
    onPointerCancel() {
      if (press.current) window.clearTimeout(press.current.timer);
      press.current = null;
    },
    onClick(event: MouseEvent) {
      const state = press.current;
      press.current = null;
      if (state?.fired) return;
      const { onPick, onOpen, isSelecting } = latest.current;
      if (state && state.pointer !== 'mouse') {
        if (isSelecting) onPick(entry, { ctrl: true, shift: false });
        else onOpen(entry);
        return;
      }
      const ctrl = event.ctrlKey || event.metaKey;
      if (!ctrl && !event.shiftKey && event.detail === 1 && latest.current.isOnlySelected(entry)) {
        pendingDeselect.current = window.setTimeout(
          () => latest.current.onDeselect(),
          DOUBLE_CLICK_MS,
        );
        return;
      }
      onPick(entry, { ctrl, shift: event.shiftKey });
    },
    onDoubleClick(event: MouseEvent) {
      cancelDeselect();
      event.preventDefault();
      latest.current.onOpen(entry);
    },
    onContextMenu(event: MouseEvent) {
      event.preventDefault();
      if (press.current?.fired) return;
      latest.current.onMenu(entry, event.clientX, event.clientY);
    },
  });
}
