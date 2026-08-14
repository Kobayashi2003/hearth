import type { PreviewItem } from '../PreviewProvider';

/**
 * Every viewer receives the same props and renders its own `ViewerChrome`, so
 * viewer-specific controls sit in the shared header rather than each viewer
 * inventing its own layout.
 */
export interface ViewerProps {
  item: PreviewItem;
  onClose: () => void;
  onMinimize: () => void;
  onTogglePin: () => void;
  onStep: (delta: number) => void;
  /** True while the window has taken the whole screen, or the whole browser. */
  isFull: boolean;
  onToggleFull: () => void;
  /**
   * Which mechanism the toggle uses. Only the label depends on it — "fullscreen"
   * promises the tab strip will go away, and it should only be promised when it
   * is true.
   */
  fullscreenMode: 'browser' | 'window';
  /**
   * True while the window is the compact content-sized card rather than a sized
   * window — the audio panel's two-column layout does not fit in one.
   */
  isCompact: boolean;
  /**
   * True when this viewer has no window and is mounted only to keep something
   * outside the page alive — today, a video that went to picture-in-picture when
   * its pinned preview was closed. A viewer in this state must not claim the
   * keyboard or the media session: the visible preview owns both.
   */
  isBackground: boolean;
}
