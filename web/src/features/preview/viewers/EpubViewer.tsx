import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';

import { api, mediaUrls } from '@/lib/api';
import { usePreferences } from '@/features/preferences/preferences';
import { useResolvedTheme } from '@/features/preferences/resolved-theme';
import { percentOf, useProgress } from '@/features/progress/progress';
import { Centered, Notice, Spinner } from '@/ui/Feedback';
import { EpubReader, type UseEpubReaderOptions } from '@/vendor/epub-reader/react';
import type { ReadingSessionRecord, ReadingSessionStorage } from '@/vendor/epub-reader/core';
import '@/vendor/epub-reader/styles.css';
import { ViewerFrame } from '../ViewerFrame';
import { HEARTH_THEME, READER_CONFIGURATIONS } from './epub-theme';
import type { ViewerProps } from '../overlay';

const SAVE_DEBOUNCE_MS = 1500;

interface Loaded {
  bytes: Blob;
  record: ReadingSessionRecord | null;
}

/**
 * The vendored EPUB reader, with its reading session (position, preferences,
 * bookmarks, highlights) stored in the Ledger rather than in this browser, so
 * a book opened on the phone continues where the desk left it. The colour
 * theme is not the book's but the person's (Hob), so every book opens in the
 * last one chosen; the default, Hearth, follows Hearth's light and dark.
 */
export default function EpubViewer({ entry }: ViewerProps) {
  const path = entry.path;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { save } = useProgress();
  const spineCount = useRef(0);
  const { current: readerTheme, choose: chooseTheme, apply: applyTheme } = useReaderTheme();
  const scheme = useOpenedScheme(readerTheme);

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
      load: key => (key === path ? applyTheme(latest) : null),
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
  }, [loaded, path, save, applyTheme]);

  const readerOptions = useMemo<Omit<UseEpubReaderOptions, 'extensions'> | null>(
    () =>
      storage
        ? {
            readingSession: { key: path, storage, persistPreferences: true, saveDelayMs: 500 },
            // The component defaults to edge-to-edge text; a saved session's own margin still wins.
            preferences: { pageMarginPercent: 6, theme: readerTheme },
            onReady: snapshot => {
              spineCount.current = snapshot.publication.spine.length;
            },
          }
        : null,
    // Options are read when the book opens; a later theme here only matches what the reader shows.
    [storage, path, readerTheme],
  );

  return (
    <ViewerFrame entry={entry} tone="paper">
      {error ? (
        <Notice icon={<BookOpen />} title="This book could not be opened" body={error} />
      ) : !loaded || !readerOptions ? (
        <Centered>
          <Spinner />
        </Centered>
      ) : (
        // The reader's own scrollbars and controls follow the scheme of the theme it draws.
        <div className="absolute inset-0" style={{ colorScheme: scheme }}>
          <EpubReader
            // A new scheme while it follows Hearth: open again, at the same place, in the other palette.
            key={scheme}
            source={loaded.bytes}
            readerOptions={readerOptions}
            configuration={READER_CONFIGURATIONS[scheme]}
            onThemeChange={chooseTheme}
          />
        </div>
      )}
    </ViewerFrame>
  );
}

/**
 * The person's reader theme (Hob): put into a saved session when the reader
 * loads it, and kept when they pick another in a book.
 */
function useReaderTheme() {
  const { preferences, update } = usePreferences();
  const current = preferences.readerTheme;
  // Read when the reader loads a session, which happens outside a render.
  const latest = useRef(current);
  useEffect(() => {
    latest.current = current;
  }, [current]);
  const choose = useCallback(
    (theme: string) => {
      if (theme !== latest.current) update('readerTheme', theme);
    },
    [update],
  );
  const apply = useCallback(
    (record: ReadingSessionRecord | null) => withTheme(record, latest.current),
    [],
  );
  return { current, choose, apply };
}

/**
 * The scheme the reader's Hearth theme was built for. It follows Hearth only
 * while the book is in that theme; a book in Sepia stays open when Hearth
 * turns dark.
 */
function useOpenedScheme(readerTheme: string): 'light' | 'dark' {
  const scheme = useResolvedTheme();
  const [opened, setOpened] = useState(scheme);
  if (opened !== scheme && readerTheme === HEARTH_THEME) setOpened(scheme);
  return opened;
}

/** A saved session's theme gives way to the person's: the theme belongs to them, not the book. */
function withTheme(
  record: ReadingSessionRecord | null,
  theme: string,
): ReadingSessionRecord | null {
  if (!record?.preferences) return record;
  return { ...record, preferences: { ...record.preferences, theme } };
}
