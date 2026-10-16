import { useCallback, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';

import { useIsCompact } from '@/hooks/useMediaQuery';
import { useRemembered } from '@/lib/storage';

export const DEFAULT_WIDTH = 256;
export const MIN_WIDTH = 200;
const MAX_WIDTH = 420;
/** Dragged this narrow, the sidebar is being put away, as in an editor. */
const PUT_AWAY_BELOW = 140;
/** What the listing needs beside the sidebar; the sidebar gives way down to its minimum, then becomes a drawer. */
const MAIN_MIN = 720;
const KEY_STEP = 16;

/**
 * `docked` beside the content; `hidden` by choice, brought back from the
 * header; `drawer` when the window cannot spare the room, or is a phone on
 * its side.
 */
export type SidebarMode = 'docked' | 'hidden' | 'drawer';

export interface SidebarLayout {
  mode: SidebarMode;
  /** What it is drawn at: the chosen width, narrowed to leave the listing its room. */
  width: number;
  /** During a drag, before it is kept. */
  resizing: boolean;
  /** Dragged past the point where letting go puts it away. */
  puttingAway: boolean;
  setHidden: (hidden: boolean) => void;
  resizer: {
    min: number;
    max: number;
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLElement>) => void;
    onPointerCancel: () => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
    onDoubleClick: () => void;
  };
}

/** Width and whether it is put away belong to this device: a laptop and a desk monitor differ. */
export function useSidebarLayout(): SidebarLayout {
  const [chosen, setChosen] = useRemembered<number>('sidebar.width', DEFAULT_WIDTH);
  const [hidden, setHidden] = useRemembered<boolean>('sidebar.hidden', false);
  const viewport = useViewportWidth();
  const compact = useIsCompact();
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef({ x: 0, width: 0 });

  const max = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, viewport - MAIN_MIN));
  const clamp = (value: number) => Math.round(Math.min(max, Math.max(MIN_WIDTH, value)));
  const width = clamp(drag ?? chosen);
  const puttingAway = drag !== null && drag < PUT_AWAY_BELOW;
  const fits = viewport >= MIN_WIDTH + MAIN_MIN && !compact;
  const mode: SidebarMode = !fits ? 'drawer' : hidden || puttingAway ? 'hidden' : 'docked';

  const resizer: SidebarLayout['resizer'] = {
    min: MIN_WIDTH,
    max,
    onPointerDown(event) {
      if (event.button !== 0) return;
      // No text selection, and no native drag of a selection left by a double-click.
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      start.current = { x: event.clientX, width };
      setDrag(width);
    },
    onPointerMove(event) {
      if (drag === null) return;
      setDrag(start.current.width + event.clientX - start.current.x);
    },
    onPointerUp() {
      if (drag === null) return;
      if (puttingAway) setHidden(true);
      else setChosen(clamp(drag));
      setDrag(null);
    },
    onPointerCancel() {
      setDrag(null);
    },
    onKeyDown(event) {
      const next = keyWidth(event.key, width, max);
      if (next === null) return;
      event.preventDefault();
      setChosen(next);
    },
    onDoubleClick() {
      setChosen(DEFAULT_WIDTH);
    },
  };

  return {
    mode,
    width,
    resizing: drag !== null,
    puttingAway,
    setHidden: useCallback((next: boolean) => setHidden(next), [setHidden]),
    resizer,
  };
}

function keyWidth(key: string, width: number, max: number): number | null {
  switch (key) {
    case 'ArrowLeft':
      return Math.max(MIN_WIDTH, width - KEY_STEP);
    case 'ArrowRight':
      return Math.min(max, width + KEY_STEP);
    case 'Home':
      return MIN_WIDTH;
    case 'End':
      return max;
    default:
      return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

function useViewportWidth(): number {
  return useSyncExternalStore(subscribe, () => window.innerWidth);
}
