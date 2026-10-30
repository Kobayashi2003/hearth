import { useEffect } from 'react';

import { isTypingTarget } from '@/lib/keys';

/** Radix menus and dialogs inside a viewer close on their own Escape. */
const ESCAPE_OWNERS = '[data-radix-popper-content-wrapper], [role="dialog"][data-state="open"]';

/**
 * The overlay's keys, for whichever file is on top: Escape closes it (out of
 * full screen, and unless a menu or dialog in it is open), the arrows step
 * through its gallery when its viewer leaves them free.
 */
export function useOverlayKeys({
  active,
  arrows,
  onEscape,
  onStep,
}: {
  active: boolean;
  /** The top viewer does not use ←/→ itself. */
  arrows: boolean;
  onEscape: () => void;
  onStep: (delta: number) => void;
}): void {
  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      if (event.key === 'Escape') {
        if (document.fullscreenElement || document.querySelector(ESCAPE_OWNERS)) return;
        event.preventDefault();
        onEscape();
      } else if (arrows && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        onStep(event.key === 'ArrowLeft' ? -1 : 1);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, arrows, onEscape, onStep]);
}
