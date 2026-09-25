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
