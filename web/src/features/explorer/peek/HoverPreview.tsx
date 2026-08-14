import { useState } from 'react';
import { createPortal } from 'react-dom';

import { mediaUrls } from '@/lib/api';
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, type HoverPreviewTarget } from './useHoverPreview';

/**
 * A picture of the file under the cursor, and nothing else.
 *
 * Portalled to `document.body` so `position: fixed` is measured against the
 * viewport: an ancestor with a transform — which the virtualiser puts on every
 * row — would otherwise become the containing block and place this somewhere
 * else entirely.
 */
export function HoverPreview({ target }: { target: HoverPreviewTarget }) {
  const [failed, setFailed] = useState(false);

  // A thumbnail that will not load leaves nothing worth showing; an empty frame
  // following the cursor is worse than no frame.
  if (failed) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[60] rounded-lg border border-subtle bg-overlay p-1 shadow-xl"
      style={{ left: target.left, top: target.top, width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
      aria-hidden
    >
      <img
        // Requested wider than it is drawn so it stays sharp on a dense display.
        src={mediaUrls.thumbnail(target.entry.path, 480)}
        alt=""
        onError={() => setFailed(true)}
        className="h-full w-full rounded object-contain"
      />
    </div>,
    document.body,
  );
}
