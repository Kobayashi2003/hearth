import { createContext, use } from 'react';
import type { FileEntry } from '@hearth/shared';

/**
 * What a viewer receives and may ask of the overlay around it. Kept apart from
 * the overlay and the viewer registry, which load the viewers, so a viewer
 * depends only on this and never back on what loads it.
 */
export interface ViewerProps {
  entry: FileEntry;
}

export interface OverlayValue {
  close: () => void;
  /**
   * Close, then run `action` once the overlay's own history entry has been
   * stepped back over; navigating any sooner would be undone by that step.
   */
  closeThen: (action: () => void) => void;
  step: (delta: number) => void;
  index: number;
  total: number;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
}

export const OverlayContext = createContext<OverlayValue | null>(null);

export function useOverlay(): OverlayValue {
  const value = use(OverlayContext);
  if (!value) throw new Error('useOverlay must be used inside PreviewOverlay');
  return value;
}
