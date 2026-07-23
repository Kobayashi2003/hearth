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
  /**
   * Present only for compact `panel` viewers: whether the panel is expanded to
   * full size, and a toggle for it. Full viewers leave both undefined and the
   * chrome shows no expand control.
   */
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}
