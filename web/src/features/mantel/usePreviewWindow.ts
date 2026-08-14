import { useCallback, useEffect, useRef, useState } from 'react';
import type { PreviewFullscreen } from '@hearth/shared';

import type { ViewerKind } from './viewerFor';

/**
 * The preview window's geometry and its two ideas of "full".
 *
 * A preview is a window: draggable, and its size remembered per kind of file,
 * since what suits a photograph does not suit a text file. Stored as a
 * percentage of the browser window, in local storage rather than Hob — it is a
 * property of the machine you are sitting at.
 */

/** Percentages of the browser window's width and height. */
export interface PreviewSize {
  width: number;
  height: number;
}

/** Where a resize drag is pulling from: -1 west/north, 1 east/south, 0 fixed. */
export interface ResizeAxis {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
}

const STORE_PREFIX = 'hearth.preview.size.';

/**
 * The size a full-surface viewer opens at: four fifths of the window, leaving
 * enough of the explorer visible around the edge to remember it is still there.
 */
export const DEFAULT_PREVIEW_SIZE: PreviewSize = { width: 80, height: 80 };

/** Below the floor a window cannot hold a header and its content. */
const MIN_PERCENT = 25;
const MAX_PERCENT = 100;

/** Kinds worth the browser's own fullscreen: the ones read or watched at length. */
const IMMERSIVE_KINDS: ReadonlySet<ViewerKind> = new Set(['video', 'comic', 'epub', 'pdf']);

function clampPercent(value: number): number {
  return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, Math.round(value * 10) / 10));
}

export function readStoredSize(kind: ViewerKind): PreviewSize | null {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + kind);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PreviewSize>;
    if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number') return null;
    return { width: clampPercent(parsed.width), height: clampPercent(parsed.height) };
  } catch {
    return null;
  }
}

function writeStoredSize(kind: ViewerKind, size: PreviewSize): void {
  try {
    localStorage.setItem(STORE_PREFIX + kind, JSON.stringify(size));
  } catch {
    // A disabled or full storage costs a remembered size, nothing more.
  }
}

/** Which mechanism this kind's full-screen control should use. */
export function fullscreenModeFor(
  kind: ViewerKind,
  preference: PreviewFullscreen,
): 'browser' | 'window' {
  if (preference === 'browser' || preference === 'window') return preference;
  return IMMERSIVE_KINDS.has(kind) ? 'browser' : 'window';
}

export function usePreviewWindow({
  kind,
  /**
   * Null for a kind with no remembered size yet *and* no default — the compact
   * panels, which are sized by their content until the user says otherwise.
   */
  naturalSize,
  preference,
  isOpen,
}: {
  kind: ViewerKind;
  naturalSize: PreviewSize | null;
  preference: PreviewFullscreen;
  isOpen: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  const [size, setSize] = useState<PreviewSize | null>(() => readStoredSize(kind) ?? naturalSize);
  // A different kind of file is a different window with its own remembered size.
  useEffect(() => {
    setSize(readStoredSize(kind) ?? naturalSize);
    // `naturalSize` is derived from `kind`; listing it would not add a case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const mode = fullscreenModeFor(kind, preference);

  /** "Full" in the fill-the-browser-window sense. */
  const [isFilled, setFilled] = useState(false);
  /** "Full" in the browser's own sense — tracked, not assumed, because Escape
   *  and F11 leave it without going through our button. */
  const [isNativeFull, setNativeFull] = useState(false);

  useEffect(() => {
    const onChange = () => setNativeFull(document.fullscreenElement === panelRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Closing the preview gives the screen back, whichever mechanism took it.
  useEffect(() => {
    if (isOpen) return;
    setFilled(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, [isOpen]);

  // Either route counts as full: where the browser refuses fullscreen the
  // fallback below fills the window instead, and that has to read as full too.
  const isFull = isNativeFull || isFilled;

  const toggleFull = useCallback(() => {
    // Whatever we are in, leaving is the same gesture.
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      setFilled(false);
      return;
    }
    if (isFilled || mode === 'window') {
      setFilled(current => !current);
      return;
    }

    const panel = panelRef.current;
    if (!panel) return;
    // Fullscreen can be refused — an iframe without the permission, or a
    // platform that only grants it to a video element. Filling the window is the
    // same intent by the other route, so the button still does something.
    void panel.requestFullscreen().catch(() => setFilled(true));
  }, [isFilled, mode]);

  // Drag one edge or corner. The window is centred, so the width changes by
  // twice the pull — which keeps the dragged edge under the pointer.
  const latest = useRef<PreviewSize | null>(size);
  latest.current = size;

  const startResize = useCallback(
    (axis: ResizeAxis, event: React.PointerEvent<HTMLElement>) => {
      const panel = panelRef.current;
      if (!panel || event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();

      // Measured, not read from state: a content-sized panel has no percentage
      // yet, and this is where it gets one.
      const rect = panel.getBoundingClientRect();
      const startWidth = rect.width;
      const startHeight = rect.height;
      const startX = event.clientX;
      const startY = event.clientY;

      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);

      const onMove = (move: PointerEvent) => {
        const width =
          axis.x === 0
            ? (startWidth / window.innerWidth) * 100
            : ((startWidth + axis.x * (move.clientX - startX) * 2) / window.innerWidth) * 100;
        const height =
          axis.y === 0
            ? (startHeight / window.innerHeight) * 100
            : ((startHeight + axis.y * (move.clientY - startY) * 2) / window.innerHeight) * 100;

        setSize({ width: clampPercent(width), height: clampPercent(height) });
      };

      const onEnd = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onEnd);
        handle.removeEventListener('pointercancel', onEnd);
        if (latest.current) writeStoredSize(kind, latest.current);
      };

      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onEnd);
      handle.addEventListener('pointercancel', onEnd);
    },
    [kind],
  );

  /** Back to the size this kind of file opens at, and forget the drag. */
  const resetSize = useCallback(() => {
    try {
      localStorage.removeItem(STORE_PREFIX + kind);
    } catch {
      // Nothing to undo if it was never stored.
    }
    setSize(naturalSize);
  }, [kind, naturalSize]);

  return {
    panelRef,
    /** Null while the window is still sized by its content. */
    size,
    /** Inline geometry for the window, or undefined to leave it to the classes. */
    style:
      isFull || isNativeFull
        ? ({ width: '100%', height: '100%' } as const)
        : size
          ? ({ width: `${size.width}vw`, height: `${size.height}vh` } as const)
          : undefined,
    isFull,
    isNativeFull,
    fullscreenMode: mode,
    toggleFull,
    startResize,
    resetSize,
  };
}
