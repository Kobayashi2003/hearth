import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';
import type { FileEntry } from '@hearth/shared';

import { galleryFor } from '@/lib/file-kind';

interface PreviewState {
  entry: FileEntry;
  gallery: FileEntry[];
}

interface PreviewValue {
  current: PreviewState | null;
  /** `siblings` is the listing the file was opened from; the gallery is its same-kind subset. */
  open: (entry: FileEntry, siblings?: readonly FileEntry[]) => void;
  close: () => void;
  step: (delta: number) => void;
  show: (entry: FileEntry) => void;
}

const PreviewContext = createContext<PreviewValue | null>(null);

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<PreviewState | null>(null);

  const open = useCallback((entry: FileEntry, siblings: readonly FileEntry[] = []) => {
    const gallery = galleryFor(entry, siblings.length > 0 ? siblings : [entry]);
    setCurrent({
      entry,
      gallery: gallery.some(item => item.path === entry.path) ? gallery : [entry],
    });
  }, []);

  const close = useCallback(() => setCurrent(null), []);

  const step = useCallback((delta: number) => {
    setCurrent(state => {
      if (!state || state.gallery.length < 2) return state;
      const index = state.gallery.findIndex(item => item.path === state.entry.path);
      const next = state.gallery[(index + delta + state.gallery.length) % state.gallery.length];
      return next ? { ...state, entry: next } : state;
    });
  }, []);

  const show = useCallback((entry: FileEntry) => {
    setCurrent(state => (state ? { ...state, entry } : state));
  }, []);

  const value = useMemo(
    () => ({ current, open, close, step, show }),
    [current, open, close, step, show],
  );
  return <PreviewContext value={value}>{children}</PreviewContext>;
}

export function usePreview(): PreviewValue {
  const value = use(PreviewContext);
  if (!value) throw new Error('usePreview must be used inside PreviewProvider');
  return value;
}
