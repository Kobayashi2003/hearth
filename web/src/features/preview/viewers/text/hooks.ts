import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { useRemembered } from '@/lib/storage';
import { percentOf, useProgress } from '@/features/progress/progress';

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20, 22];

/**
 * Reopens where reading stopped, as a fraction of the scrollable height (the
 * same place whatever the text size). It waits for the text to be tall enough
 * to scroll, so it runs again as highlighting or Markdown finishes rendering;
 * `rendered` lists what can change that height.
 */
export function useScrollPlace(
  scrollRef: RefObject<HTMLDivElement | null>,
  path: string,
  rendered: unknown[],
) {
  const { progressFor, save } = useProgress();
  const restored = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || restored.current) return;
    const scrollable = element.scrollHeight - element.clientHeight;
    if (scrollable <= 0) return;
    restored.current = true;
    const saved = progressFor(path);
    const fraction = saved?.kind === 'locator' ? Number(saved.at) : Number.NaN;
    if (fraction > 0) element.scrollTop = fraction * scrollable;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, progressFor, scrollRef, ...rendered]);

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  /** Saved a moment after scrolling stops, not on every frame of it. */
  return useCallback(() => {
    const element = scrollRef.current;
    if (!element || !restored.current) return;
    const scrollable = element.scrollHeight - element.clientHeight;
    if (scrollable <= 0) return;
    const fraction = Math.min(1, element.scrollTop / scrollable);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(
      () =>
        save(path, {
          kind: 'locator',
          at: fraction.toFixed(4),
          percent: percentOf(fraction, 1),
          savedAt: Date.now(),
        }),
      600,
    );
  }, [path, save, scrollRef]);
}

/** Editing in place: a draft while editing, saved with the button or Ctrl+S in the encoding it was read in. */
export function useTextEdit(path: string, encoding: string | undefined, reload: () => unknown) {
  const [draft, setDraft] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);

  const commit = useCallback(async () => {
    if (draft === null) return;
    setSaving(true);
    try {
      await api.writeText(path, draft, encoding);
      toast.success('Saved');
      setDraft(null);
      await reload();
    } catch (caught) {
      toast.error('Could not save', {
        description: caught instanceof Error ? caught.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }, [path, draft, encoding, reload]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && draft !== null) {
        event.preventDefault();
        void commit();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [draft, commit]);

  return { draft, setDraft, commit, isSaving };
}

/**
 * The text size, stepped through a fixed scale and remembered. Ctrl + wheel
 * (and a trackpad pinch) sizes the text, as it would a page in the browser.
 */
export function useFontSize(scrollRef: RefObject<HTMLDivElement | null>) {
  const [fontSize, setFontSize] = useRemembered<number>('text.size', 14);

  const step = (delta: 1 | -1) => {
    const index = FONT_SIZES.indexOf(fontSize);
    const from = index < 0 ? 2 : index;
    setFontSize(FONT_SIZES[Math.max(0, Math.min(FONT_SIZES.length - 1, from + delta))]!);
  };
  const stepRef = useRef(step);
  stepRef.current = step;

  // Re-attached after every render: the scroller comes and goes with the editor.
  useEffect(() => {
    let travel = 0;
    function onWheel(event: WheelEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      travel += event.deltaY;
      if (Math.abs(travel) < 40) return;
      stepRef.current(travel < 0 ? 1 : -1);
      travel = 0;
    }
    const element = scrollRef.current;
    element?.addEventListener('wheel', onWheel, { passive: false });
    return () => element?.removeEventListener('wheel', onWheel);
  });

  return { fontSize, step };
}
