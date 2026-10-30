import { useLayoutEffect } from 'react';
import type { FileEntry } from '@hearth/shared';

import type { Explorer } from './useExplorer';
import type { Selection } from './useSelection';

/**
 * Where the cursor lands when a folder opens: on the folder just left after
 * going up, or on the item "show in folder" was asked for (selected and in
 * view; the URL parameter that carried it is dropped once used). Both happen
 * before the folder is drawn, so it never shows at its top first.
 */
export function useLanding(
  explorer: Explorer,
  selection: Selection,
  entries: readonly FileEntry[],
): void {
  const { returningTo } = explorer;
  useLayoutEffect(() => {
    if (!returningTo || !entries.some(entry => entry.path === returningTo)) return;
    selection.land(returningTo);
    explorer.clearReturningTo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returningTo, entries]);

  const target = explorer.search.reveal;
  useLayoutEffect(() => {
    if (!target || explorer.isPending) return;
    if (entries.some(entry => entry.path === target)) selection.reveal(target);
    explorer.patch({ reveal: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, entries, explorer.isPending]);
}
