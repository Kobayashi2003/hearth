import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    onChange => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** Width decides layout (sidebar, columns); pointer decides ergonomics (hit areas, long-press). */
export const useIsWide = () => useMediaQuery('(min-width: 1024px)');
export const useCoarsePointer = () => useMediaQuery('(pointer: coarse)');
/** A phone held upright: one column, controls folded into menus. */
export const useIsNarrow = () => useMediaQuery('(max-width: 639px)');
/**
 * Little room for chrome: a phone upright, or one on its side, where the
 * height is what runs out. Headers fold down to a single row.
 */
export const useIsCompact = () => useMediaQuery('(max-width: 639px), (max-height: 500px)');
