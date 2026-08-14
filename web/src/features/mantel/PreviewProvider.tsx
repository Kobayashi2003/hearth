import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';
import type { FileEntry } from '@hearth/shared';

import { PlaybackProvider } from './PlaybackProvider';

export interface PreviewItem {
  /** The file's path, which is also its identity in the stack. */
  id: string;
  entry: FileEntry;
  /** Collapsed into the dock rather than closed. */
  minimized: boolean;
  /**
   * Pinned: this preview does not close when you click away from it, and what it
   * is playing outlives its window. Pinning is the promise that a preview is
   * something you are keeping, not something you glanced at — which is why it is
   * also the condition for keeping the sound going after a close.
   */
  pinned: boolean;
  /**
   * Kept mounted with nothing on screen, because something outside the page is
   * still showing it — a video that went to picture-in-picture on close. The
   * element has to stay in the document for that window to live, so the item
   * stays in the stack until the picture-in-picture window is dismissed.
   */
  background: boolean;
  /** The sibling files this preview can step through, for gallery navigation. */
  gallery: FileEntry[];
}

interface PreviewValue {
  items: PreviewItem[];
  /** The preview currently filling the overlay, or null when all are minimized. */
  active: PreviewItem | null;
  open: (entry: FileEntry, gallery?: FileEntry[]) => void;
  close: (id: string) => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
  togglePin: (id: string) => void;
  /** Take the window away but keep the viewer alive — see `background`. */
  sendToBackground: (id: string) => void;
  /** Move to the previous or next entry in the active preview's gallery. */
  step: (delta: number) => void;
}

const PreviewContext = createContext<PreviewValue | null>(null);

/**
 * The preview stack. Several previews coexist: one fills the overlay while the
 * rest sit minimised in the dock, which is what lets someone keep an album
 * playing while reading a document.
 */
export function PreviewProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const open = useCallback((entry: FileEntry, gallery: FileEntry[] = []) => {
    setItems(current => {
      const existing = current.find(item => item.id === entry.path);
      if (existing) {
        return current.map(item =>
          item.id === entry.path
            ? { ...item, minimized: false, background: false, gallery }
            : item,
        );
      }
      return [
        ...current,
        { id: entry.path, entry, minimized: false, pinned: false, background: false, gallery },
      ];
    });
    setActiveId(entry.path);
  }, []);

  const close = useCallback((id: string) => {
    setItems(current => current.filter(item => item.id !== id));
    setActiveId(current => (current === id ? null : current));
  }, []);

  const minimize = useCallback((id: string) => {
    setItems(current =>
      current.map(item => (item.id === id ? { ...item, minimized: true } : item)),
    );
    setActiveId(current => (current === id ? null : current));
  }, []);

  const restore = useCallback((id: string) => {
    setItems(current =>
      current.map(item => (item.id === id ? { ...item, minimized: false, background: false } : item)),
    );
    setActiveId(id);
  }, []);

  const sendToBackground = useCallback((id: string) => {
    setItems(current =>
      current.map(item => (item.id === id ? { ...item, background: true } : item)),
    );
    setActiveId(current => (current === id ? null : current));
  }, []);

  const togglePin = useCallback((id: string) => {
    setItems(current =>
      current.map(item => (item.id === id ? { ...item, pinned: !item.pinned } : item)),
    );
  }, []);

  /** Replaces the active preview in place, so stepping does not grow the stack. */
  const step = useCallback(
    (delta: number) => {
      setItems(current => {
        const active = current.find(item => item.id === activeId);
        if (!active || active.gallery.length === 0) return current;

        const index = active.gallery.findIndex(entry => entry.path === active.id);
        if (index === -1) return current;

        const next = active.gallery[(index + delta + active.gallery.length) % active.gallery.length];
        if (!next || next.path === active.id) return current;

        setActiveId(next.path);
        return current.map(item =>
          item.id === active.id ? { ...item, id: next.path, entry: next } : item,
        );
      });
    },
    [activeId],
  );

  const value = useMemo<PreviewValue>(
    () => ({
      items,
      active:
        items.find(item => item.id === activeId && !item.minimized && !item.background) ?? null,
      open,
      close,
      minimize,
      restore,
      togglePin,
      sendToBackground,
      step,
    }),
    [items, activeId, open, close, minimize, restore, togglePin, sendToBackground, step],
  );

  return (
    <PlaybackProvider>
      <PreviewContext value={value}>{children}</PreviewContext>
    </PlaybackProvider>
  );
}

export function usePreview(): PreviewValue {
  const value = use(PreviewContext);
  if (!value) throw new Error('usePreview must be used inside PreviewProvider');
  return value;
}
