import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';

import { api, mediaUrls } from '@/lib/api';
import { percentOf, useProgress } from '@/features/progress/progress';
import { Centered, Notice, Spinner } from '@/ui/Feedback';
import { EpubReader, type UseEpubReaderOptions } from '@/vendor/epub-reader/react';
import type { ReadingSessionRecord, ReadingSessionStorage } from '@/vendor/epub-reader/core';
import '@/vendor/epub-reader/styles.css';
import { ViewerFrame } from '../ViewerFrame';
import type { ViewerProps } from '../viewers';

const SAVE_DEBOUNCE_MS = 1500;

interface Loaded {
  bytes: Blob;
  record: ReadingSessionRecord | null;
}

/**
 * The vendored EPUB reader, with its reading session (position, preferences,
 * bookmarks, highlights) stored in the Ledger rather than in this browser, so
 * a book opened on the phone continues where the desk left it.
 */
export default function EpubViewer({ entry }: ViewerProps) {
  const path = entry.path;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { save } = useProgress();
  const spineCount = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(mediaUrls.raw(path), { credentials: 'same-origin', signal: controller.signal }).then(
        response => {
          if (!response.ok) throw new Error(`The server answered ${response.status}`);
          return response.blob();
        },
      ),
      api
        .readingSession(path, controller.signal)
        .then(response => response.record as ReadingSessionRecord | null)
        .catch(() => null),
    ])
      .then(([bytes, record]) => setLoaded({ bytes, record }))
      .catch(caught => {
        if (!controller.signal.aborted)
          setError(caught instanceof Error ? caught.message : 'The book could not be loaded');
      });
    return () => controller.abort();
  }, [path]);

  const storage = useMemo<ReadingSessionStorage | null>(() => {
    if (!loaded) return null;
    let latest = loaded.record;
    let timer: number | undefined;
    return {
      load: key => (key === path ? latest : null),
      save: (key, record) => {
        if (key !== path) return;
        latest = record;
        window.clearTimeout(timer);
        timer = window.setTimeout(
          () => void api.saveReadingSession(path, record).catch(() => undefined),
          SAVE_DEBOUNCE_MS,
        );

        const { spineIndex, locations } = record.locator;
        if (spineCount.current > 0) {
          const position = spineIndex + (locations.progression ?? 0);
          save(path, {
            kind: 'locator',
            at: `${spineIndex}:${(locations.progression ?? 0).toFixed(4)}`,
            percent: percentOf(position, spineCount.current),
            savedAt: Date.now(),
          });
        }
      },
      remove: key => {
        if (key !== path) return;
        latest = null;
        void api.removeReadingSession(path).catch(() => undefined);
      },
    };
  }, [loaded, path, save]);

  const readerOptions = useMemo<Omit<UseEpubReaderOptions, 'extensions'> | null>(
    () =>
      storage
        ? {
            readingSession: { key: path, storage, persistPreferences: true, saveDelayMs: 500 },
            // The component defaults to edge-to-edge text; a saved session's own margin still wins.
            preferences: { pageMarginPercent: 6 },
            onReady: snapshot => {
              spineCount.current = snapshot.publication.spine.length;
            },
          }
        : null,
    [storage, path],
  );

  return (
    <ViewerFrame entry={entry} className="bg-surface text-ink">
      {error ? (
        <Notice icon={<BookOpen />} title="This book could not be opened" body={error} />
      ) : !loaded || !readerOptions ? (
        <Centered>
          <Spinner />
        </Centered>
      ) : (
        <div className="absolute inset-0">
          <EpubReader source={loaded.bytes} readerOptions={readerOptions} />
        </div>
      )}
    </ViewerFrame>
  );
}
