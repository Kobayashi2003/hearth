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
}
