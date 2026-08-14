import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Progress } from '@hearth/shared';

import { api, mediaUrls } from '@/lib/api';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useLedger } from '@/features/ledger/useLedger';

/**
 * The reading state of one comic: which page, how it is laid out, and keeping
 * Ledger informed so the book reopens where it was left — on any device.
 */

export type Spread = 'single' | 'double';
export type Fit = 'width' | 'height' | 'original';
/** Manga reads right-to-left; western comics left-to-right. */
export type Flow = 'ltr' | 'rtl';

/** Pages warmed ahead of, and behind, the current one so a turn is instant. */
const PRELOAD_AHEAD = 3;
const PRELOAD_BEHIND = 1;

const SETTING_PREFIX = 'hearth.comic.';

/**
 * A setting that outlives the book. Read once on mount and written on every
 * change; a storage that refuses to co-operate costs the memory and nothing else.
 */
function useRemembered<T extends string>(
  key: string,
  fallback: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return (localStorage.getItem(SETTING_PREFIX + key) as T | null) ?? fallback;
    } catch {
      return fallback;
    }
  });

  const remember = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(SETTING_PREFIX + key, next);
      } catch {
        // Nothing to do: the choice still applies to this session.
      }
    },
    [key],
  );

  return [value, remember];
}

export function useComicReader(path: string) {
  const { progressFor, saveProgress, markOpened } = useLedger();
  const breakpoint = useBreakpoint();

  const [pageIndex, setPageIndex] = useState(0);

  /**
   * How this reader is set is remembered, because it is a property of the shelf
   * rather than of the book: someone who reads manga reads the next one
   * right-to-left too, and having to say so again for every volume was the
   * clearest way the reader wasted its reader's time.
   *
   * Locally rather than in Hob: it goes with the screen it was chosen on — two
   * pages side by side is right on a monitor and wrong on the phone in your
   * pocket.
   */
  const [spread, setSpread] = useRemembered<Spread>('spread', 'single');
  const [flow, setFlow] = useRemembered<Flow>('flow', 'ltr');
  // Fitting the height on a phone letterboxes the page into a stamp between two
  // fat black bars. A narrow screen wants the width filled and the page scrolled;
  // a wide one wants the whole page visible at once.
  const [fit, setFit] = useRemembered<Fit>('fit', breakpoint === 'narrow' ? 'width' : 'height');
  /** Cleared once the saved page has been applied, so it only happens once. */
  const restored = useRef<string | null>(null);

  const { data, isPending, error } = useQuery({
    queryKey: ['comic', path],
    queryFn: ({ signal }) => api.openComic(path, signal),
    staleTime: Infinity,
  });

  const pageCount = data?.pageCount ?? 0;
  const step = spread === 'double' ? 2 : 1;

  const goTo = useCallback(
    (index: number) => setPageIndex(Math.max(0, Math.min(Math.max(pageCount - 1, 0), index))),
    [pageCount],
  );

  /** A turn moves forward in reading order, whichever way the pages run. */
  const turn = useCallback(
    (direction: 1 | -1) => goTo(pageIndex + direction * step),
    [goTo, pageIndex, step],
  );

  useEffect(() => {
    setPageIndex(0);
    restored.current = null;
  }, [path]);

  // Resume once the manifest is known — the saved index means nothing until the
  // page count is available to clamp it against.
  useEffect(() => {
    if (!data || restored.current === path) return;
    restored.current = path;
    markOpened(path);

    const saved = progressFor(path);
    if (saved?.kind === 'page' && typeof saved.at === 'number') {
      // A finished book starts over rather than reopening on its last page.
      const finished = saved.at >= data.pageCount - 1;
      if (!finished) setPageIndex(Math.min(saved.at, data.pageCount - 1));
    }
  }, [data, markOpened, path, progressFor]);

  useEffect(() => {
    if (!data || restored.current !== path || pageCount === 0) return;
    const progress: Progress = {
      kind: 'page',
      at: pageIndex,
      total: pageCount,
      percent: Math.round(((pageIndex + 1) / pageCount) * 100),
      savedAt: Date.now(),
    };
    saveProgress(path, progress);
  }, [data, pageCount, pageIndex, path, saveProgress]);

  // Warm neighbouring pages. Reading backwards is common enough — checking a
  // panel you skimmed — that one page behind is worth holding too.
  useEffect(() => {
    if (!data) return;
    for (let offset = -PRELOAD_BEHIND; offset <= PRELOAD_AHEAD; offset += 1) {
      if (offset === 0) continue;
      const page = data.pages[pageIndex + offset];
      if (page) new Image().src = mediaUrls.comicPage(data.key, page);
    }
  }, [data, pageIndex]);

  const visible = data ? data.pages.slice(pageIndex, pageIndex + step).filter(Boolean) : [];

  return {
    data,
    isPending,
    error,
    pageIndex,
    pageCount,
    step,
    spread,
    fit,
    flow,
    visible: flow === 'rtl' ? [...visible].reverse() : visible,
    goTo,
    turn,
    setSpread,
    setFit,
    setFlow,
  };
}
