import { useCallback, useState } from 'react';
import type { FileEntry } from '@hearth/shared';

import { viewerKindFor, type ViewerKind } from '@/lib/file-kind';
import { STEPS_WITH_ARROWS } from './viewers';

/** A file shown over the one the preview opened with, and what its arrows step through. */
export interface Layer {
  entry: FileEntry;
  gallery: FileEntry[];
}

/**
 * Files opened over the preview's own (one inside an archive over the
 * archive), newest on top. They belong to the file they were opened over, so
 * a different file starts with none.
 */
export function useInnerLayers(shown: { entry: FileEntry } | null) {
  const opener = shown ? shown.entry.path : null;
  const [layers, setLayers] = useState<Layer[]>([]);
  const [openedOver, setOpenedOver] = useState(opener);
  if (openedOver !== opener) {
    setOpenedOver(opener);
    setLayers([]);
  }

  const open = useCallback(
    (entry: FileEntry, gallery: FileEntry[]) =>
      setLayers(current => [...current, { entry, gallery }]),
    [],
  );
  const closeTop = useCallback(() => setLayers(current => current.slice(0, -1)), []);
  /** Next or previous in the top layer's gallery, stopping at either end. */
  const stepTop = useCallback(
    (delta: number) =>
      setLayers(current => {
        const top = current.at(-1);
        if (!top) return current;
        const index = top.gallery.findIndex(item => item.path === top.entry.path);
        const next = top.gallery[index + delta];
        return next ? [...current.slice(0, -1), { ...top, entry: next }] : current;
      }),
    [],
  );

  const top = layers.at(-1) ?? null;
  /** What Escape and the arrows act on: the top layer if there is one, else the preview's own file. */
  const keysOver = (kind: ViewerKind, close: () => void, step: (delta: number) => void) => ({
    arrows: STEPS_WITH_ARROWS.has(top ? viewerKindFor(top.entry) : kind),
    onEscape: top ? closeTop : close,
    onStep: top ? stepTop : step,
  });

  return { layers, top, open, closeTop, stepTop, keysOver };
}
