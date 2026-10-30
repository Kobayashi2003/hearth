import { Component, useMemo, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';

import { viewerKindFor } from '@/lib/file-kind';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import type { Layer } from './inner-layers';
import { OverlayContext, type OverlayValue } from './overlay';
import { VIEWERS } from './viewers';

/** One file over the preview, with its own close and arrows; the rest of the overlay is shared. */
export function InnerLayer({
  layer,
  overlay,
  onClose,
  onStep,
}: {
  /** Nothing over the preview: nothing drawn. */
  layer: Layer | null;
  overlay: OverlayValue;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  const gallery = layer?.gallery ?? [];
  const index = layer ? gallery.findIndex(item => item.path === layer.entry.path) : -1;
  const value = useMemo<OverlayValue>(
    () => ({
      ...overlay,
      close: onClose,
      closeThen: action => {
        onClose();
        action();
      },
      step: onStep,
      index,
      total: gallery.length,
    }),
    [overlay, onClose, onStep, index, gallery.length],
  );
  if (!layer) return null;
  const kind = viewerKindFor(layer.entry);
  // Only previewable files are opened over another; anything else is downloaded instead.
  if (kind === 'none') return null;
  const Viewer = VIEWERS[kind];
  return (
    <div className="animate-fade absolute inset-0 z-10 flex flex-col bg-stage">
      <OverlayContext value={value}>
        <ViewerBoundary key={layer.entry.path} onClose={onClose}>
          <Viewer entry={layer.entry} />
        </ViewerBoundary>
      </OverlayContext>
    </div>
  );
}

/** A viewer that throws takes down only itself, not the explorer behind it. */
export class ViewerBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { error: Error | null }
> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <Notice
        icon={<TriangleAlert />}
        title="This file could not be shown"
        body={`${this.state.error.message}. Download it to open it in another app.`}
        action={
          <Button variant="stage" onClick={this.props.onClose}>
            Close
          </Button>
        }
      />
    );
  }
}
