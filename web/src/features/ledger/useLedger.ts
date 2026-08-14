import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LedgerDocument, LedgerPatch, Progress } from '@hearth/shared';

import { api } from '@/lib/api';

/**
 * Ledger on the client: where you were, shared across your devices.
 *
 * Writes are coalesced through a module-level outbox rather than sent per
 * event. A playing video reports its position several times a second, and every
 * one of those must not become a request — but the *last* one before you close
 * the tab must not be lost either.
 */

const FLUSH_INTERVAL_MS = 5000;

let outbox: LedgerPatch = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Every mounted consumer, not one.
 *
 * This was a single callback, which meant the explorer, the comic reader and
 * the EPUB reader overwrote each other — and the first viewer to unmount set it
 * to null, so after closing a book the explorer stopped seeing progress updates
 * at all. The queue itself stays module-level on purpose: closing a viewer must
 * not discard progress that has not been sent yet.
 */
const listeners = new Set<(document: LedgerDocument) => void>();

function hasPending(): boolean {
  return Boolean(outbox.opened || outbox.pin || Object.keys(outbox.progress ?? {}).length > 0);
}

async function flush(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!hasPending()) return;

  const payload = outbox;
  outbox = {};
  try {
    const document = await api.patchLedger(payload);
    for (const listener of listeners) listener(document);
  } catch {
    // Losing a few seconds of reading position is not worth surfacing. The next
    // flush carries the newer position anyway.
  }
}

function enqueue(patch: LedgerPatch): void {
  // A later position for the same path replaces the earlier one — only the
  // newest matters, and merging keeps the request one object regardless of how
  // long the outbox sat.
  outbox = {
    ...outbox,
    ...patch,
    progress: { ...outbox.progress, ...patch.progress },
  };
  flushTimer ??= setTimeout(() => void flush(), FLUSH_INTERVAL_MS);
}

if (typeof window !== 'undefined') {
  // `pagehide` rather than `beforeunload`: it is the one that fires on iOS when
  // the tab is backgrounded, which is exactly how a phone stops watching.
  window.addEventListener('pagehide', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
}

export function useLedger() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['ledger'],
    queryFn: () => api.ledger(),
    staleTime: 60_000,
    // Signed-out users get an empty ledger rather than an error boundary.
    retry: false,
  });

  useEffect(() => {
    const listener = (document: LedgerDocument) => queryClient.setQueryData(['ledger'], document);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [queryClient]);

  const progressFor = useCallback(
    (path: string): Progress | undefined => data?.progress[path],
    [data],
  );

  const saveProgress = useCallback((path: string, progress: Progress) => {
    enqueue({ progress: { [path]: progress } });
  }, []);

  const markOpened = useCallback((path: string) => {
    enqueue({ opened: path });
  }, []);

  const setPinned = useCallback((path: string, value: boolean) => {
    enqueue({ pin: { path, value } });
  }, []);

  return {
    ledger: data,
    progressFor,
    saveProgress,
    markOpened,
    setPinned,
    /** Send anything queued now — used when a viewer closes. */
    flush,
  };
}

