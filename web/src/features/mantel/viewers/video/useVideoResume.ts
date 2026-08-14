import { useCallback, useEffect, useRef } from 'react';

import { useLedger } from '@/features/ledger/useLedger';

/**
 * Where a video was left off, kept in Ledger like every other kind of progress.
 *
 * This used to be its own `localStorage` map, which meant the one medium people
 * most often resume — a film you fell asleep during — was the one that did not
 * follow you to another device, while comics and books did.
 */

/** Below this you have barely started, and resuming would be surprising. */
const MIN_RESUMABLE_SECONDS = 30;
/** Within this of the end it counts as watched, and it starts over. */
const END_MARGIN_SECONDS = 20;
/** `timeupdate` fires several times a second; the outbox coalesces, but not for free. */
const SAVE_EVERY_SECONDS = 5;

export function useVideoResume(path: string) {
  const { progressFor, saveProgress, markOpened } = useLedger();

  /** Read once per file: later reads would race the position being written. */
  const startAt = useRef<number | null>(null);
  const lastSaved = useRef(0);
  const opened = useRef<string | null>(null);

  if (startAt.current === null) {
    const saved = progressFor(path);
    startAt.current =
      saved?.kind === 'time' && typeof saved.at === 'number' ? saved.at : 0;
  }

  useEffect(() => {
    startAt.current = null;
    lastSaved.current = 0;
  }, [path]);

  useEffect(() => {
    if (opened.current === path) return;
    opened.current = path;
    markOpened(path);
  }, [markOpened, path]);

  const save = useCallback(
    (positionSeconds: number, durationSeconds: number) => {
      if (!Number.isFinite(positionSeconds) || !Number.isFinite(durationSeconds)) return;
      if (Math.abs(positionSeconds - lastSaved.current) < SAVE_EVERY_SECONDS) return;
      lastSaved.current = positionSeconds;

      const worthResuming =
        positionSeconds >= MIN_RESUMABLE_SECONDS &&
        (durationSeconds === 0 || positionSeconds < durationSeconds - END_MARGIN_SECONDS);

      saveProgress(path, {
        kind: 'time',
        // A finished film records the end, so "Continue" drops it rather than
        // offering to resume twenty seconds before the credits for ever.
        at: worthResuming ? positionSeconds : durationSeconds || positionSeconds,
        total: durationSeconds || undefined,
        percent: durationSeconds
          ? Math.min(100, Math.round((positionSeconds / durationSeconds) * 100))
          : 0,
        savedAt: Date.now(),
      });
    },
    [path, saveProgress],
  );

  /** Seconds to start at, or 0 — never within a whisker of the end. */
  const resumeAt = useCallback((durationSeconds: number): number => {
    const at = startAt.current ?? 0;
    if (at < MIN_RESUMABLE_SECONDS) return 0;
    if (durationSeconds > 0 && at > durationSeconds - END_MARGIN_SECONDS) return 0;
    return at;
  }, []);

  return { resumeAt, save };
}
