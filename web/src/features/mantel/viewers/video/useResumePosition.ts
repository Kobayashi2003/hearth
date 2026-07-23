import { useCallback, useEffect, useRef } from 'react';

const STORAGE_KEY = 'hearth.resume';
const MAX_REMEMBERED = 200;

/** Below this, the viewer has barely started and resuming would be surprising. */
const MIN_RESUMABLE_SECONDS = 30;
/** Within this of the end, the file counts as watched and starts over. */
const END_MARGIN_SECONDS = 20;

type ResumeMap = Record<string, { position: number; savedAt: number }>;

function read(): ResumeMap {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as ResumeMap;
  } catch {
    return {};
  }
}

/**
 * Remembers where a video was left off. Positions are keyed by path and pruned
 * to the most recent few hundred, so a large library cannot fill local storage.
 */
export function useResumePosition(path: string) {
  const lastSaved = useRef(0);

  const savedPosition = useCallback((): number => read()[path]?.position ?? 0, [path]);

  const save = useCallback(
    (position: number, duration: number) => {
      // Throttled: `timeupdate` fires several times a second.
      if (Math.abs(position - lastSaved.current) < 5) return;
      lastSaved.current = position;

      const entries = read();
      const isWorthResuming =
        position >= MIN_RESUMABLE_SECONDS && position < duration - END_MARGIN_SECONDS;

      if (isWorthResuming) entries[path] = { position, savedAt: Date.now() };
      else delete entries[path];

      const pruned = Object.entries(entries)
        .sort(([, a], [, b]) => b.savedAt - a.savedAt)
        .slice(0, MAX_REMEMBERED);

      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(pruned)));
    },
    [path],
  );

  useEffect(() => {
    lastSaved.current = 0;
  }, [path]);

  return { savedPosition, save };
}
