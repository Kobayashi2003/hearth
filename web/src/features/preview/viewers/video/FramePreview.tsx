import type { FileEntry } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';
import { useThumbnail } from '@/lib/thumbnails';

/** About a hundred moments a video: enough to find a scene, few enough to cache. */
const MOMENTS = 100;
const WIDTH = 240;

/**
 * The frame near a moment, above the seek bar while it is hovered or dragged.
 * Moments are rounded, so passing back over the bar reuses frames already
 * fetched; one passed over before it arrived is cancelled by the queue.
 */
export function FramePreview({
  entry,
  at,
  duration,
  aspect,
}: {
  entry: FileEntry;
  at: number;
  duration: number;
  /** Width over height, from the probe; 16:9 until it is known. */
  aspect: number;
}) {
  const step = Math.max(1, duration / MOMENTS);
  // Not the very end: ffmpeg finds nothing to decode past the last frame.
  const moment = Math.min(Math.round(at / step) * step, Math.max(0, duration - 1));
  const version = `${Date.parse(entry.mtime)}-${entry.size}`;
  const frame = useThumbnail(
    duration > 0 ? mediaUrls.frame(entry.path, Number(moment.toFixed(1)), WIDTH, version) : null,
  );
  return (
    <div
      className="w-40 overflow-hidden rounded-lg border border-white/20 bg-black/80 shadow-lg"
      style={{ aspectRatio: aspect }}
    >
      {frame.src ? <img src={frame.src} alt="" className="size-full object-cover" /> : null}
    </div>
  );
}
