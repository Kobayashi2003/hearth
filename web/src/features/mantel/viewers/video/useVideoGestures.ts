import { useCallback, useRef, useState } from 'react';

/**
 * The touch vocabulary every phone video player shares, so that muscle memory
 * built elsewhere works here:
 *
 *   horizontal drag, anywhere  → scrub
 *   vertical drag, left third  → brightness
 *   vertical drag, right third → volume
 *   double tap, left / right   → skip back / forward
 *
 * The middle third is left alone vertically: that is where a thumb rests, and
 * claiming it would make every accidental brush change something.
 *
 * These are pointer events, not touch events, so the same drags work with a
 * mouse held down — the desktop player this replaces had no way to scrub
 * without hitting the bar exactly. Taps stay touch-only: a click on the picture
 * already means something on a desktop, and a mouse has a scrubber to aim at.
 */

/** Below this the pointer is a tap, not a drag. */
const DRAG_THRESHOLD_PX = 12;
/** How far a full-height drag travels: the whole 0–1 range. */
const VERTICAL_RANGE_PX = 240;
/** A second tap inside this window, on the same side, is a double tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SKIP_SECONDS = 10;
/** Seconds of video per pixel dragged: a thumb-swipe crosses a scene, not a film. */
const SECONDS_PER_PIXEL = 0.5;

export type Osd =
  | { kind: 'seek'; seconds: number; delta: number }
  | { kind: 'volume'; value: number }
  | { kind: 'brightness'; value: number }
  | null;

type Axis = 'undecided' | 'seek' | 'brightness' | 'volume';

export interface VideoGestureActions {
  positionSeconds: () => number;
  durationSeconds: () => number;
  volume: () => number;
  onSeek: (seconds: number) => void;
  onVolume: (value: number) => void;
  onToggle: () => void;
}

export function useVideoGestures(enabled: boolean, actions: VideoGestureActions) {
  const [osd, setOsd] = useState<Osd>(null);
  const [brightness, setBrightness] = useState(1);

  const start = useRef<{
    id: number;
    touch: boolean;
    x: number;
    y: number;
    from: number;
    volume: number;
  } | null>(null);
  const axis = useRef<Axis>('undecided');
  const lastTap = useRef<{ at: number; side: 'left' | 'right' } | null>(null);
  const osdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Read by the viewer to swallow the click that follows a drag. Without it,
   * releasing a scrub lands as a click on the picture and toggles the chrome.
   */
  const dragged = useRef(false);

  const flash = useCallback((next: Osd) => {
    setOsd(next);
    if (osdTimer.current) clearTimeout(osdTimer.current);
    osdTimer.current = setTimeout(() => setOsd(null), 700);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!enabled) return;
      // Only the primary button drags; a right-click is a context menu.
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      start.current = {
        id: event.pointerId,
        touch: event.pointerType !== 'mouse',
        x: event.clientX,
        y: event.clientY,
        from: actions.positionSeconds(),
        volume: actions.volume(),
      };
      axis.current = 'undecided';
      dragged.current = false;
    },
    [actions, enabled],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const origin = start.current;
      if (!origin || origin.id !== event.pointerId) return;

      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;

      if (axis.current === 'undecided') {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        dragged.current = true;
        // Keeps the gesture alive if the pointer leaves the element mid-drag.
        event.currentTarget.setPointerCapture?.(event.pointerId);

        if (Math.abs(dx) > Math.abs(dy)) {
          axis.current = 'seek';
        } else {
          const bounds = event.currentTarget.getBoundingClientRect();
          const third = (origin.x - bounds.left) / bounds.width;
          // The middle stays neutral, so a resting thumb changes nothing.
          axis.current = third < 0.33 ? 'brightness' : third > 0.67 ? 'volume' : 'seek';
        }
      }

      if (axis.current === 'seek') {
        const duration = actions.durationSeconds();
        const target = Math.max(
          0,
          Math.min(duration || Infinity, origin.from + dx * SECONDS_PER_PIXEL),
        );
        flash({ kind: 'seek', seconds: target, delta: target - origin.from });
        return;
      }

      const step = -dy / VERTICAL_RANGE_PX;
      if (axis.current === 'volume') {
        const next = Math.min(1, Math.max(0, origin.volume + step));
        actions.onVolume(next);
        flash({ kind: 'volume', value: next });
      } else {
        setBrightness(current => {
          const next = Math.min(1, Math.max(0.2, current + step * 0.15));
          flash({ kind: 'brightness', value: next });
          return next;
        });
      }
    },
    [actions, flash],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const origin = start.current;
      if (!origin || origin.id !== event.pointerId) return;
      start.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);

      // A drag that became a scrub commits on release, so the video is not
      // re-seeking on every pixel of the swipe.
      if (axis.current === 'seek' && osd?.kind === 'seek') {
        actions.onSeek(osd.seconds);
        axis.current = 'undecided';
        return;
      }
      if (axis.current !== 'undecided') {
        axis.current = 'undecided';
        return;
      }

      // Still undecided means it never moved: a tap. Only fingers get this —
      // see the note at the top.
      if (!origin.touch) return;

      const bounds = event.currentTarget.getBoundingClientRect();
      const side = event.clientX - bounds.left < bounds.width / 2 ? 'left' : 'right';
      const now = Date.now();

      if (lastTap.current && now - lastTap.current.at < DOUBLE_TAP_MS && lastTap.current.side === side) {
        const delta = side === 'left' ? -DOUBLE_TAP_SKIP_SECONDS : DOUBLE_TAP_SKIP_SECONDS;
        const target = Math.max(0, actions.positionSeconds() + delta);
        actions.onSeek(target);
        flash({ kind: 'seek', seconds: target, delta });
        lastTap.current = null;
        return;
      }

      lastTap.current = { at: now, side };
    },
    [actions, flash, osd],
  );

  const onPointerCancel = useCallback(() => {
    start.current = null;
    axis.current = 'undecided';
  }, []);

  return {
    osd,
    brightness,
    /** True while the last pointer sequence was a drag, not a click. */
    draggedRef: dragged,
    handlers: enabled
      ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }
      : {},
  };
}
