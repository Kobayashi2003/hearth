import { useCallback, useMemo, useRef, useState } from 'react';
import type { FileEntry } from '@hearth/shared';

const TYPEAHEAD_RESET_MS = 700;

/**
 * Focus (where the keyboard points) is separate from selection (what an
 * operation applies to), which is what makes discontiguous keyboard selection
 * possible. Both are keyed by path, so they survive re-sorting.
 */
export function useSelection(entries: readonly FileEntry[]) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const anchor = useRef<string | null>(null);
  const typeahead = useRef({ text: '', at: 0 });

  const indexOf = useCallback(
    (path: string | null) => (path ? entries.findIndex(entry => entry.path === path) : -1),
    [entries],
  );

  const selectedEntries = useMemo(
    () => entries.filter(entry => selected.has(entry.path)),
    [entries, selected],
  );

  const clear = useCallback(() => {
    setSelected(new Set());
    anchor.current = null;
  }, []);

  const reset = useCallback(() => {
    clear();
    setFocused(null);
  }, [clear]);

  const range = useCallback(
    (from: number, to: number) => {
      const [start, end] = from < to ? [from, to] : [to, from];
      return entries.slice(start, end + 1).map(entry => entry.path);
    },
    [entries],
  );

  /** A click: plain replaces, ctrl toggles, shift extends from the anchor. */
  const pick = useCallback(
    (path: string, modifiers: { ctrl?: boolean; shift?: boolean } = {}) => {
      setFocused(path);
      if (modifiers.shift && anchor.current) {
        const extension = range(indexOf(anchor.current), indexOf(path));
        setSelected(current => new Set(modifiers.ctrl ? [...current, ...extension] : extension));
        return;
      }
      anchor.current = path;
      if (modifiers.ctrl) {
        setSelected(current => {
          const next = new Set(current);
          if (next.has(path)) next.delete(path);
          else next.add(path);
          return next;
        });
      } else {
        setSelected(new Set([path]));
      }
    },
    [range, indexOf],
  );

  /** Keyboard movement: plain moves focus and selects, shift extends, ctrl moves focus only. */
  const move = useCallback(
    (delta: number | 'start' | 'end', modifiers: { ctrl?: boolean; shift?: boolean } = {}) => {
      if (entries.length === 0) return;
      const current = indexOf(focused);
      const target =
        delta === 'start'
          ? 0
          : delta === 'end'
            ? entries.length - 1
            : current === -1
              ? delta > 0
                ? 0
                : entries.length - 1
              : Math.max(0, Math.min(entries.length - 1, current + delta));
      const path = entries[target]!.path;
      setFocused(path);
      if (modifiers.ctrl) return;
      if (modifiers.shift) {
        anchor.current ??= focused ?? path;
        setSelected(new Set(range(indexOf(anchor.current), target)));
      } else {
        anchor.current = path;
        setSelected(new Set([path]));
      }
    },
    [entries, focused, indexOf, range],
  );

  const toggleFocused = useCallback(() => {
    if (focused) pick(focused, { ctrl: true });
  }, [focused, pick]);

  const selectAll = useCallback(
    () => setSelected(new Set(entries.map(entry => entry.path))),
    [entries],
  );
  const invert = useCallback(
    () =>
      setSelected(
        current =>
          new Set(entries.filter(entry => !current.has(entry.path)).map(entry => entry.path)),
      ),
    [entries],
  );

  /** Typing a name jumps to it; letters typed quickly accumulate into one prefix. */
  const typeTo = useCallback(
    (character: string) => {
      const now = Date.now();
      const state = typeahead.current;
      state.text = now - state.at > TYPEAHEAD_RESET_MS ? character : state.text + character;
      state.at = now;
      const needle = state.text.toLowerCase();
      // A repeated single letter cycles through the items starting with it.
      const cycling = [...needle].every(letter => letter === needle[0]);
      const prefix = cycling ? needle[0]! : needle;
      const start = indexOf(focused);
      const from = start === -1 ? 0 : cycling ? start + 1 : start;
      const ordered = [...entries.slice(from), ...entries.slice(0, from)];
      const hit = ordered.find(entry => entry.name.toLowerCase().startsWith(prefix));
      if (hit) {
        setFocused(hit.path);
        anchor.current = hit.path;
        setSelected(new Set([hit.path]));
      }
    },
    [entries, focused, indexOf],
  );

  return {
    selected,
    selectedEntries,
    focused,
    focusedIndex: indexOf(focused),
    setFocused,
    pick,
    move,
    toggleFocused,
    selectAll,
    invert,
    clear,
    reset,
    typeTo,
  };
}

export type Selection = ReturnType<typeof useSelection>;
