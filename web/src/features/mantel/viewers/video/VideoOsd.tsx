import { Sun, Volume2 } from 'lucide-react';

import { formatDuration } from '@/lib/format';
import type { Osd } from './useVideoGestures';

/**
 * The readout a gesture leaves behind while your thumb is still on the glass.
 *
 * A swipe that changes something invisibly is indistinguishable from a swipe
 * that did nothing, so each one says what it did and by how much — and a scrub
 * shows the signed offset, because "+01:20" answers "how far did I go" while an
 * absolute timestamp does not.
 */
export function VideoOsd({ osd }: { osd: Osd }) {
  if (!osd) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div className="flex min-w-28 flex-col items-center gap-1.5 rounded-xl bg-black/65 px-4 py-3 text-white backdrop-blur-sm">
        {osd.kind === 'seek' ? (
          <>
            <span className="tabular text-lg font-medium">{formatDuration(osd.seconds)}</span>
            <span className="tabular text-xs text-white/70">
              {osd.delta >= 0 ? '+' : '−'}
              {formatDuration(Math.abs(osd.delta))}
            </span>
          </>
        ) : (
          <>
            {osd.kind === 'volume' ? (
              <Volume2 className="h-5 w-5" />
            ) : (
              <Sun className="h-5 w-5" />
            )}
            <span className="tabular text-sm font-medium">{Math.round(osd.value * 100)}%</span>
            <span className="h-1 w-20 overflow-hidden rounded-full bg-white/25">
              <span
                className="block h-full bg-white"
                style={{ width: `${Math.round(osd.value * 100)}%` }}
              />
            </span>
          </>
        )}
      </div>
    </div>
  );
}
