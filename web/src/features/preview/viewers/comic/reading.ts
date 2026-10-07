import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import type { ComicManifest } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';
import { percentOf, useProgress } from '@/features/progress/progress';

/** Wheel travel past a page's edge that turns it, so reading to the bottom does not overshoot. */
const EDGE_TURN_DELTA = 120;
const EDGE_TURN_COOLDOWN_MS = 350;
const WIDTH_SCALE_MIN = 0.5;
const WIDTH_SCALE_MAX = 3;
const PRELOAD_AHEAD = 4;

/**
 * Fit to width: the wheel scrolls the page, and pushing on past its end turns
 * it; Ctrl + wheel widens or narrows the pages instead of zooming the browser.
 * Turning back sets `landAtBottom`, so the previous page opens at its end,
 * where reading left it.
 */
export function useEdgeTurn({
  scrollRef,
  enabled,
  ready,
  turn,
  scaleBy,
  landAtBottom,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  /** The scroller exists only once the comic has opened. */
  ready: unknown;
  turn: (forward: boolean) => void;
  scaleBy: (change: (scale: number) => number) => void;
  landAtBottom: MutableRefObject<boolean>;
}) {
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !enabled) return;
    let travel = 0;
    let turnedAt = 0;
    function onWheel(event: WheelEvent) {
      if (!element) return;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        scaleBy(scale => clamp(scale * Math.exp(-event.deltaY / 400)));
        return;
      }
      if (!pushingPastEdge(element, event.deltaY)) {
        travel = 0;
        return;
      }
      event.preventDefault();
      // One flick, one page: a page shorter than the screen is at both ends at once.
      if (performance.now() - turnedAt < EDGE_TURN_COOLDOWN_MS) return;
      travel += event.deltaY;
      if (Math.abs(travel) < EDGE_TURN_DELTA) return;
      turnedAt = performance.now();
      const forward = travel > 0;
      travel = 0;
      landAtBottom.current = !forward;
      turn(forward);
    }
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [scrollRef, enabled, ready, turn, scaleBy, landAtBottom]);
}

function pushingPastEdge(element: HTMLElement, deltaY: number): boolean {
  const atEnd = element.scrollTop + element.clientHeight >= element.scrollHeight - 2;
  const atStart = element.scrollTop <= 0;
  return (deltaY > 0 && atEnd) || (deltaY < 0 && atStart);
}

function clamp(scale: number): number {
  return Math.min(WIDTH_SCALE_MAX, Math.max(WIDTH_SCALE_MIN, scale));
}

/**
 * Opens at the page read last (unless that was the last page), keeps the
 * place as pages turn, starts each new page at its top, and fetches the next
 * few pages ahead so turning is instant.
 */
export function useComicPlace({
  path,
  data,
  page,
  setPage,
  perView,
  scrollRef,
  landAtBottom,
}: {
  path: string;
  data: ComicManifest | undefined;
  page: number;
  setPage: (page: number) => void;
  perView: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  landAtBottom: MutableRefObject<boolean>;
}) {
  const { progressFor, save } = useProgress();
  const restored = useRef(false);

  useEffect(() => {
    if (!data || restored.current) return;
    restored.current = true;
    const saved = progressFor(path);
    if (saved?.kind === 'page' && typeof saved.at === 'number' && saved.at < data.pageCount - 1)
      setPage(saved.at);
  }, [data, path, progressFor, setPage]);

  useEffect(() => {
    if (!data || !restored.current) return;
    const count = data.pageCount;
    save(path, {
      kind: 'page',
      at: page,
      total: count,
      percent: percentOf(page + perView, count),
      savedAt: Date.now(),
    });
    if (!landAtBottom.current) scrollRef.current?.scrollTo({ top: 0 });
    for (let offset = 1; offset <= PRELOAD_AHEAD; offset += 1) {
      const next = data.pages[page + perView - 1 + offset];
      if (next) new Image().src = mediaUrls.comicPage(data.key, next);
    }
  }, [data, page, perView, path, save, scrollRef, landAtBottom]);
}
