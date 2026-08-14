import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileEntry } from '@hearth/shared';

import { useInputCapability } from '@/hooks/useInputCapability';
import { BREAKPOINTS } from '@/hooks/useBreakpoint';

/**
 * The floating thumbnail that follows the cursor — the behaviour carried over
 * from SimpleFileServer, which had it right.
 *
 * Deliberately *only* pictures. A card for a `.txt` repeated the row it was
 * covering: name, kind, size and modified were already on screen. What hover
 * buys is seeing the image without opening it, and nothing else has an image
 * worth interrupting a scan of the list for.
 *
 * Distinct from the Peek card, which long-press raises on touch: that one has
 * to carry actions because there is no right-click there. This one is a look,
 * not a menu, so it never takes the pointer.
 */

/** Long enough that dragging the cursor across a grid does not flash a preview per tile. */
const HOVER_DELAY_MS = 400;

export const PREVIEW_WIDTH = 240;
export const PREVIEW_HEIGHT = 180;
/** Clear of the cursor, so the preview never sits under the thing it describes. */
const CURSOR_GAP = 16;
const EDGE_MARGIN = 8;

export interface HoverPreviewTarget {
  entry: FileEntry;
  left: number;
  top: number;
}

/** Only a raster image. Video, comics and books open rather than hover. */
function isPreviewableImage(entry: FileEntry): boolean {
  if (entry.isDirectory) return false;
  return entry.mimeType.startsWith('image/') || entry.name.toLowerCase().endsWith('.psd');
}

export function useHoverPreview() {
  const { hover, coarse } = useInputCapability();
  const [target, setTarget] = useState<HoverPreviewTarget | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A narrow window has nowhere to put a 240px card without covering the list
  // it is describing, which is also why SimpleFileServer gated on width.
  const enabled = hover && !coarse && window.innerWidth >= BREAKPOINTS.medium;

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setTarget(null);
  }, []);

  useEffect(() => cancel, [cancel]);

  /** Any scroll moves the row out from under the cursor, so the preview goes. */
  useEffect(() => {
    if (!target) return;
    const hide = () => cancel();
    window.addEventListener('scroll', hide, { capture: true, passive: true });
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, { capture: true });
      window.removeEventListener('resize', hide);
    };
  }, [target, cancel]);

  /** To the right of the cursor; flipped left near the edge, clamped vertically. */
  const place = useCallback((entry: FileEntry, x: number, y: number): HoverPreviewTarget => {
    const rightOfCursor = x + CURSOR_GAP;
    const left =
      rightOfCursor + PREVIEW_WIDTH > window.innerWidth - EDGE_MARGIN
        ? x - PREVIEW_WIDTH - CURSOR_GAP
        : rightOfCursor;

    const top = Math.max(
      EDGE_MARGIN,
      Math.min(y - PREVIEW_HEIGHT / 2, window.innerHeight - PREVIEW_HEIGHT - EDGE_MARGIN),
    );

    return { entry, left: Math.max(EDGE_MARGIN, left), top };
  }, []);

  const handlersFor = useCallback(
    (entry: FileEntry) => {
      if (!enabled || !isPreviewableImage(entry)) return {};

      return {
        onMouseEnter: (event: React.MouseEvent) => {
          const { clientX, clientY } = event;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setTarget(place(entry, clientX, clientY)), HOVER_DELAY_MS);
        },
        onMouseMove: (event: React.MouseEvent) => {
          // Tracks the cursor while shown; before that it only updates where the
          // preview will appear.
          const { clientX, clientY } = event;
          setTarget(current => (current ? place(entry, clientX, clientY) : current));
        },
        onMouseLeave: cancel,
      };
    },
    [cancel, enabled, place],
  );

  return { target, handlersFor, close: cancel };
}
