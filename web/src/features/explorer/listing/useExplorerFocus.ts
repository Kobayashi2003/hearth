import { useCallback, useMemo, useRef } from 'react';
import type { FileEntry } from '@hearth/shared';

import { useFocusModel } from './useFocusModel';

/**
 * Binds the generic focus model to a listing: translates between the model's
 * indices and the paths the rest of the explorer speaks, and remembers how many
 * columns the current layout has so ↑↓ move a row rather than an item.
 */
export function useExplorerFocus({
  entries,
  columns,
  pageRows,
  onOpen,
}: {
  entries: FileEntry[];
  columns: number;
  pageRows: number;
  onOpen: (entry: FileEntry) => void;
}) {
  // Read lazily through a ref: type-ahead needs the current names, but
  // recomputing the array on every keystroke would rebuild it for nothing.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const initials = useCallback(
    () => entriesRef.current.map(entry => entry.name.toLowerCase()),
    [],
  );

  const model = useFocusModel({
    count: entries.length,
    columns,
    pageRows,
    initials,
    onOpen: index => {
      const entry = entriesRef.current[index];
      if (entry) onOpen(entry);
    },
  });

  const selectedPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const index of model.selected) {
      const entry = entries[index];
      if (entry) paths.add(entry.path);
    }
    return paths;
  }, [entries, model.selected]);

  const selectedEntries = useMemo(
    () => entries.filter((_, index) => model.selected.has(index)),
    [entries, model.selected],
  );

  /**
   * A right-click on an unselected item selects it first, so the menu always
   * acts on what was clicked rather than on a stale selection elsewhere.
   */
  const focusForContextMenu = useCallback(
    (index: number) => {
      if (!model.selected.has(index)) model.selectAt(index, {});
      else model.setFocused(index);
    },
    [model],
  );

  return { ...model, selectedPaths, selectedEntries, focusForContextMenu };
}
