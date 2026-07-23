import { useCallback, useMemo, useRef, useState } from 'react';
import type { FileEntry } from '@hearth/shared';

/**
 * Multi-selection with the modifier conventions every file manager shares:
 * plain click replaces, Ctrl/Cmd toggles, Shift extends from the last anchor.
 */
export function useSelection(entries: FileEntry[]) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const anchorIndex = useRef<number | null>(null);

  const select = useCallback(
    (path: string, index: number, modifiers: { ctrl?: boolean; shift?: boolean } = {}) => {
      setSelected(current => {
        if (modifiers.shift && anchorIndex.current !== null) {
          const from = Math.min(anchorIndex.current, index);
          const to = Math.max(anchorIndex.current, index);
          const range = entries.slice(from, to + 1).map(entry => entry.path);
          return new Set(modifiers.ctrl ? [...current, ...range] : range);
        }

        anchorIndex.current = index;

        if (modifiers.ctrl) {
          const next = new Set(current);
          if (!next.delete(path)) next.add(path);
          return next;
        }

        // Clicking the only selected item again clears it, which is how a
        // person deselects without hunting for empty space.
        return current.size === 1 && current.has(path) ? new Set() : new Set([path]);
      });
    },
    [entries],
  );

  const selectAll = useCallback(() => {
    setSelected(new Set(entries.map(entry => entry.path)));
  }, [entries]);

  const invert = useCallback(() => {
    setSelected(current => new Set(entries.filter(e => !current.has(e.path)).map(e => e.path)));
  }, [entries]);

  const clear = useCallback(() => {
    setSelected(new Set());
    anchorIndex.current = null;
  }, []);

  /** Selected entries in display order, so batch operations are predictable. */
  const selectedEntries = useMemo(
    () => entries.filter(entry => selected.has(entry.path)),
    [entries, selected],
  );

  return { selected, selectedEntries, select, selectAll, invert, clear };
}
