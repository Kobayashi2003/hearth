import { useEffect } from 'react';

import { isTypingTarget } from '@/features/explorer/commands/commands';

/**
 * The keys that mean the same thing in every viewer.
 *
 * Per-viewer keys — turning a page, seeking, zooming — stay in the viewer that
 * owns them. What lives here is the window itself: closing it, putting it in the
 * dock, pinning it, and stepping to the next file where the viewer's kind allows
 * stepping at all (see `stepFamilyOf`).
 *
 * Registered on `window` because the overlay is not always what holds focus —
 * an EPUB renders into an iframe, and a video takes focus when you click it.
 */
export interface PreviewKeyActions {
  onClose: () => void;
  onMinimize: () => void;
  onTogglePin: () => void;
  /** Absent when this file's kind does not step. */
  onStep?: (delta: number) => void;
}

export function usePreviewKeys(active: boolean, actions: PreviewKeyActions): void {
  useEffect(() => {
    if (!active) return;

    function onKeyDown(event: KeyboardEvent) {
      // Never steal a keystroke from a field, a page-number box included.
      if (isTypingTarget(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          actions.onClose();
          return;
        case 'm':
        case 'M':
          event.preventDefault();
          actions.onMinimize();
          return;
        case 'p':
        case 'P':
          event.preventDefault();
          actions.onTogglePin();
          return;
        // Stepping between *files* is Shift+arrow, leaving the bare arrows to
        // the viewer for moving within one — a comic page, a video's timeline.
        case 'ArrowRight':
          if (!event.shiftKey || !actions.onStep) return;
          event.preventDefault();
          actions.onStep(1);
          return;
        case 'ArrowLeft':
          if (!event.shiftKey || !actions.onStep) return;
          event.preventDefault();
          actions.onStep(-1);
          return;
        default:
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, actions]);
}
