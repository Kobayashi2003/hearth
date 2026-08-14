import { useCallback, useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { PanelRightClose } from 'lucide-react';
import type { FileEntry } from '@hearth/shared';

import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { usePlayback } from '../../PlaybackProvider';

const ROW_HEIGHT = 40;

/** Wide enough for a track number and a few words of title. */
const MIN_WIDTH = 144;
/** Past this the album is wider than the player it belongs to. */
const MAX_WIDTH = 560;
const DEFAULT_WIDTH = 240;

const WIDTH_KEY = 'hearth.audio.playlist-width';

function readWidth(): number {
  try {
    const stored = Number.parseInt(localStorage.getItem(WIDTH_KEY) ?? '', 10);
    return Number.isFinite(stored) ? clamp(stored) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function clamp(width: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
}

/**
 * The album beside the player: virtualised, because a music folder can hold
 * thousands of tracks, and sizable, because how much of the window a list of
 * filenames deserves depends on the filenames. The width is remembered in this
 * browser, like the window's own size.
 */
export function Playlist({
  entries,
  compact,
  onClose,
}: {
  entries: FileEntry[];
  /** True while the window is the content-sized card; see the height note below. */
  compact: boolean;
  onClose: () => void;
}) {
  const playback = usePlayback();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [width, setWidth] = useState(readWidth);
  const latest = useRef(width);
  latest.current = width;

  // Dragged from the left edge, so the edge stays under the pointer and the
  // player takes whatever is left over.
  const startResize = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = latest.current;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);

    const onMove = (move: PointerEvent) => setWidth(clamp(startWidth + (startX - move.clientX)));
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      try {
        localStorage.setItem(WIDTH_KEY, String(latest.current));
      } catch {
        // The width still applies for this session.
      }
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  }, []);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  // Follow the playing track. A folder of two hundred tracks otherwise leaves
  // you scrolled to wherever you last were, with no sign of where you are now.
  const currentIndex = entries.findIndex(entry => entry.path === playback.track?.path);
  const { scrollToIndex } = virtualizer;
  useEffect(() => {
    if (currentIndex >= 0) scrollToIndex(currentIndex, { align: 'auto' });
  }, [currentIndex, scrollToIndex]);

  return (
    <aside
      className="relative flex min-h-0 shrink-0 flex-col border-l border-subtle"
      // Capped as well as set, so a window narrower than the remembered width
      // still leaves the player somewhere to live.
      style={{ width, maxWidth: '60%' }}
    >
      <div
        aria-hidden
        onPointerDown={startResize}
        className="absolute -left-1 top-0 z-10 h-full w-2 cursor-ew-resize touch-none"
      />

      <div className="flex items-center gap-1 border-b border-subtle py-1 pl-3 pr-1">
        <h3 className="eyebrow min-w-0 flex-1 truncate">Playlist · {entries.length}</h3>
        <Tooltip label="Hide playlist">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Hide playlist">
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>

      {/*
        A height of its own when the window is sized by its contents: `flex-1
        min-h-0` bounds nothing without a definite height on some ancestor, and
        the content-sized card has none — so the list resolved to its full virtual
        height, never scrolled, and pushed the centred player off screen. Only
        above `sm`; the phone sheet is `h-[80vh]`, which is definite.
      */}
      <div ref={scrollRef} className={cn('min-h-0 flex-1 overflow-y-auto', compact && 'sm:max-h-96')}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map(row => {
            const entry = entries[row.index]!;
            const isCurrent = playback.track?.path === entry.path;
            return (
              <button
                key={entry.path}
                type="button"
                onClick={() => playback.play(entry, entries)}
                className={cn(
                  'absolute inset-x-0 flex items-center gap-2 px-3 text-left text-[0.8125rem]',
                  'hover:bg-sunken',
                  isCurrent ? 'text-accent' : 'text-secondary',
                )}
                style={{ height: row.size, transform: `translateY(${row.start}px)` }}
              >
                <span className="tabular w-6 shrink-0 text-xs text-muted">{row.index + 1}</span>
                <span className="truncate">{entry.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
