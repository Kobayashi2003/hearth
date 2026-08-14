import { useCallback, useEffect, useRef, useState } from 'react';

import { useInputCapability } from '@/hooks/useInputCapability';

/**
 * Viewer chrome retreats when nothing is happening, on every device — immersion
 * is a global behaviour, not a small-screen concession. What differs is how it
 * is summoned back, and that follows the input axis:
 *
 *   coarse pointer — a tap on the content wakes it
 *   fine pointer   — any pointer movement wakes it; stillness re-arms the timer
 *   keyboard       — any key wakes it
 *
 * This mirrors what full-screen video players have taught everyone to expect.
 */
const IDLE_MS = 2500;

export function useChromeIdle(active: boolean) {
  const { coarse } = useInputCapability();
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set while a menu or scrubber is engaged — chrome must not vanish mid-gesture. */
  const held = useRef(false);

  const disarm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const arm = useCallback(() => {
    disarm();
    if (!active || held.current) return;
    timer.current = setTimeout(() => setVisible(false), IDLE_MS);
  }, [active, disarm]);

  const wake = useCallback(() => {
    setVisible(true);
    arm();
  }, [arm]);

  /** Tap-to-toggle, for coarse pointers where there is no movement to detect. */
  const toggle = useCallback(() => {
    setVisible(current => {
      const next = !current;
      if (next) arm();
      else disarm();
      return next;
    });
  }, [arm, disarm]);

  /** Hold chrome open while a popover or scrubber is in use. */
  const hold = useCallback(
    (holding: boolean) => {
      held.current = holding;
      if (holding) {
        setVisible(true);
        disarm();
      } else {
        arm();
      }
    },
    [arm, disarm],
  );

  useEffect(() => {
    if (!active) {
      disarm();
      setVisible(true);
      return;
    }
    arm();
    return disarm;
  }, [active, arm, disarm]);

  useEffect(() => {
    if (!active) return;

    const onKey = () => wake();
    window.addEventListener('keydown', onKey);

    // Pointer movement is only a wake signal where hovering is real; on a
    // touchscreen every "move" is part of a tap or a swipe and would keep the
    // chrome permanently awake.
    if (coarse) {
      return () => window.removeEventListener('keydown', onKey);
    }

    let lastX = 0;
    let lastY = 0;
    const onMove = (event: PointerEvent) => {
      // Sub-pixel jitter from a resting mouse must not count as movement.
      if (Math.abs(event.clientX - lastX) < 2 && Math.abs(event.clientY - lastY) < 2) return;
      lastX = event.clientX;
      lastY = event.clientY;
      wake();
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', onMove);
    };
  }, [active, coarse, wake]);

  return { visible, wake, toggle, hold, coarse };
}
