import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Progress, ProgressMap } from '@hearth/shared';

import { api } from '@/lib/api';

const FLUSH_INTERVAL_MS = 4000;
const QUERY_KEY = ['progress'] as const;

/*
 * Writes are coalesced in a module-level outbox: a playing video reports its
 * position several times a second, but only the newest per path matters — and
 * the last one before the tab closes must not be lost when a viewer unmounts.
 */
let outbox: Record<string, Progress | null> = {};
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(map: ProgressMap) => void>();

async function flushProgress(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  if (Object.keys(outbox).length === 0) return;

  const payload = outbox;
  outbox = {};
  try {
    const map = await api.patchProgress(payload);
    for (const listener of listeners) listener(map);
  } catch {
    // The next save carries a newer position anyway.
  }
}

function enqueue(path: string, progress: Progress | null): void {
  outbox = { ...outbox, [path]: progress };
  timer ??= setTimeout(() => void flushProgress(), FLUSH_INTERVAL_MS);
}

// pagehide rather than beforeunload: it is what fires when a phone backgrounds the tab.
window.addEventListener('pagehide', () => void flushProgress());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void flushProgress();
});

export function useProgress() {
  const queryClient = useQueryClient();
  const { data, isFetched } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.progress(),
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    const listener = (map: ProgressMap) => queryClient.setQueryData(QUERY_KEY, map);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [queryClient]);

  const progressFor = useCallback((path: string): Progress | undefined => data?.[path], [data]);
  const save = useCallback((path: string, progress: Progress) => enqueue(path, progress), []);
  const forget = useCallback((path: string) => enqueue(path, null), []);

  // Settled either way: a viewer must not start (and then save) before it could see the saved position.
  return { progress: data, progressFor, save, forget, isReady: isFetched };
}

export function percentOf(position: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((position / total) * 100)));
}
