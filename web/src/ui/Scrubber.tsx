import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';

/** How often a live drag may seek: often enough to follow, rarely enough not to choke. */
const LIVE_SEEK_MS = 150;
const KEY_STEP_SECONDS = 5;

/**
 * A seek bar that works the way the big players do. Hovering shows the time
 * (and `preview`, say a frame) above the pointer. Dragging moves the bar and
 * the time with the pointer and seeks once, on release; with `live` it also
 * seeks along the way, at most every 150ms, so the picture follows. The whole
 * bar is a tall target and does not scroll the page under a finger.
 */
export function Scrubber({
  value,
  max,
  buffered = 0,
  onChange,
  onScrub,
  live = false,
  preview,
  label,
  className,
}: {
  value: number;
  max: number;
  buffered?: number;
  /** The chosen moment: on release, and along a live drag. */
  onChange: (value: number) => void;
  /** A drag began (true) or ended (false), so a player can pause and resume around it. */
  onScrub?: (scrubbing: boolean) => void;
  live?: boolean;
  preview?: (value: number) => ReactNode;
  label: string;
  className?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const { track, hover, drag, handlers } = useScrubPointer({
    value,
    max: safeMax,
    disabled: max <= 0,
    onChange,
    onScrub,
    live,
  });
  const shown = drag ?? Math.min(value, safeMax);
  const pointed = drag ?? hover;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = keyTarget(event.key, value, safeMax);
    if (target === null) return;
    // Handled here, so the player's own arrow keys do not also move it.
    event.preventDefault();
    event.stopPropagation();
    onChange(target);
  };

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={formatDuration(shown)}
      onKeyDown={onKeyDown}
      {...handlers}
      className={cn(
        'group relative flex h-6 cursor-pointer touch-none select-none items-center outline-none [@media(pointer:coarse)]:h-10',
        className,
      )}
    >
      <Track
        shown={shown}
        buffered={buffered}
        hover={drag === null ? hover : null}
        dragging={drag !== null}
        max={safeMax}
      />
      {pointed !== null ? <PointedTime at={pointed} max={safeMax} preview={preview} /> : null}
    </div>
  );
}

/**
 * Hover and drag along the bar. A drag reports where it is and seeks on
 * release (and along the way when `live`); one taken away by the system puts
 * a live seek back where it started.
 */
function useScrubPointer({
  value,
  max,
  disabled,
  onChange,
  onScrub,
  live,
}: {
  value: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
  onScrub: ((scrubbing: boolean) => void) | undefined;
  live: boolean;
}) {
  const track = useRef<HTMLDivElement | null>(null);
  const before = useRef(0);
  const liveSeek = useLiveSeek(onChange);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);

  const valueAt = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * max;
  };
  const end = () => {
    liveSeek.stop();
    setDrag(null);
  };

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (event.button !== 0 || disabled) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const at = valueAt(event.clientX);
      before.current = value;
      setDrag(at);
      onScrub?.(true);
      if (live) liveSeek.seek(at);
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const at = valueAt(event.clientX);
      if (drag === null) {
        if (event.pointerType === 'mouse') setHover(at);
        return;
      }
      setDrag(at);
      if (live) liveSeek.seek(at);
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) {
      if (drag === null) return;
      end();
      onChange(valueAt(event.clientX));
      onScrub?.(false);
    },
    // Taken away (a scroll, a system gesture): the drag is abandoned, not committed.
    onPointerCancel() {
      if (drag === null) return;
      end();
      if (live) onChange(before.current);
      onScrub?.(false);
    },
    onPointerLeave() {
      setHover(null);
    },
  };
  return { track, hover, drag, handlers };
}

/**
 * Seeks at most every LIVE_SEEK_MS along a drag, and once more for where the
 * pointer came to rest, so the picture always ends up under it.
 */
function useLiveSeek(onChange: (value: number) => void) {
  const last = useRef(Number.NEGATIVE_INFINITY);
  const trailing = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(trailing.current), []);
  const fire = (at: number) => {
    last.current = performance.now();
    onChange(at);
  };
  return {
    seek(at: number) {
      window.clearTimeout(trailing.current);
      const wait = LIVE_SEEK_MS - (performance.now() - last.current);
      if (wait <= 0) fire(at);
      else trailing.current = window.setTimeout(() => fire(at), wait);
    },
    stop() {
      window.clearTimeout(trailing.current);
    },
  };
}

/** The bar itself: buffered, the hovered stretch, what has played, and the thumb. */
function Track({
  shown,
  buffered,
  hover,
  dragging,
  max,
}: {
  shown: number;
  buffered: number;
  hover: number | null;
  dragging: boolean;
  max: number;
}) {
  const percent = (part: number) => `${Math.min(100, (part / max) * 100)}%`;
  return (
    <>
      <div
        className={cn(
          'absolute inset-x-0 h-1 rounded-full bg-current/15 transition-[height] group-hover:h-1.5 group-focus-visible:h-1.5',
          dragging && 'h-1.5',
        )}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-current/25"
          style={{ width: percent(buffered) }}
        />
        {hover !== null ? (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-current/25"
            style={{ width: percent(hover) }}
          />
        ) : null}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-ember"
          style={{ width: percent(shown) }}
        />
      </div>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute size-3.5 -translate-x-1/2 rounded-full bg-ember opacity-0 shadow transition-[opacity,transform] group-hover:opacity-100 group-focus-visible:opacity-100',
          dragging && 'scale-125 opacity-100',
        )}
        style={{ left: percent(shown) }}
      />
    </>
  );
}

/** The time under the pointer, in a bubble kept inside the bar's ends. */
function PointedTime({
  at,
  max,
  preview,
}: {
  at: number;
  max: number;
  preview: ((value: number) => ReactNode) | undefined;
}) {
  const fraction = at / max;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-full mb-2 flex flex-col items-center gap-1"
      style={{
        left: `${fraction * 100}%`,
        // Centred on the pointer, but pulled in at the ends so it never leaves the bar.
        transform: `translateX(-${Math.round(fraction * 100)}%)`,
      }}
    >
      {preview?.(at)}
      <span className="tabular rounded-md bg-black/75 px-1.5 py-0.5 text-[12px] font-medium text-white">
        {formatDuration(at)}
      </span>
    </div>
  );
}

function keyTarget(key: string, value: number, max: number): number | null {
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return Math.max(0, value - KEY_STEP_SECONDS);
    case 'ArrowRight':
    case 'ArrowUp':
      return Math.min(max, value + KEY_STEP_SECONDS);
    case 'Home':
      return 0;
    case 'End':
      return max;
    default:
      return null;
  }
}
