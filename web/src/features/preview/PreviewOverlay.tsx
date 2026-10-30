import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { viewerKindFor } from '@/lib/file-kind';
import { useProgress } from '@/features/progress/progress';
import { Centered, Spinner } from '@/ui/Feedback';
import { OverlayContext, type OverlayValue } from './overlay';
import { useInnerLayers } from './inner-layers';
import { useOverlayKeys } from './overlay-keys';
import { InnerLayer, ViewerBoundary } from './PreviewLayers';
import { usePreview } from './PreviewProvider';
import { useBackToClose } from './useBackToClose';
import { VIEWERS } from './viewers';

/** The full-bleed stage a file is shown on. Mounted by the shell, above the routed page. */
export function PreviewOverlay() {
  const { current, close, step } = usePreview();
  const { isReady: progressReady } = useProgress();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setFullscreen] = useState(false);

  useBackToClose(current !== null, close);
  const inner = useInnerLayers(current);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const closeAll = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    close();
  }, [close]);

  // Ctrl + wheel over a preview means the preview (viewers that use it take it
  // first); it must never zoom the whole page behind it.
  const isShowing = current !== null;
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const guard = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };
    root.addEventListener('wheel', guard, { passive: false });
    return () => root.removeEventListener('wheel', guard);
  }, [isShowing]);

  const closeThen = useCallback(
    (action: () => void) => {
      let done = false;
      const run = () => {
        if (done) return;
        done = true;
        window.removeEventListener('popstate', run);
        action();
      };
      window.addEventListener('popstate', run);
      // In case there was no entry to step back over.
      window.setTimeout(run, 400);
      closeAll();
    },
    [closeAll],
  );

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void rootRef.current?.requestFullscreen().catch(() => undefined);
  }, []);

  const kind = current ? viewerKindFor(current.entry) : 'none';
  const index = current ? current.gallery.findIndex(item => item.path === current.entry.path) : -1;
  const total = current?.gallery.length ?? 0;

  useOverlayKeys({ active: current !== null, ...inner.keysOver(kind, closeAll, step) });

  const value = useMemo<OverlayValue>(
    () => ({
      close: closeAll,
      closeThen,
      step,
      index,
      total,
      isFullscreen,
      toggleFullscreen,
      openInside: inner.open,
    }),
    [closeAll, closeThen, step, index, total, isFullscreen, toggleFullscreen, inner.open],
  );

  // Closing fades out an empty stage; the viewer itself unmounts at once, so
  // playback stops (or hands off to the dock) exactly when it did before.
  const isOpen = current !== null && kind !== 'none';
  const [wasOpen, setWasOpen] = useState(isOpen);
  const [leaving, setLeaving] = useState(false);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    setLeaving(!isOpen);
  }

  if (!current || kind === 'none') {
    return leaving ? (
      <div
        aria-hidden
        className="animate-fade-out pointer-events-none fixed inset-0 z-50 bg-stage"
        onAnimationEnd={() => setLeaving(false)}
      />
    ) : null;
  }
  const Viewer = VIEWERS[kind];

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={current.entry.name}
      className="animate-fade fixed inset-0 z-50 flex flex-col bg-stage pr-[var(--safe-right)] pl-[var(--safe-left)] text-stage-ink"
    >
      <OverlayContext value={value}>
        <Suspense
          fallback={
            <Centered>
              <Spinner />
            </Centered>
          }
        >
          {progressReady ? (
            <>
              <ViewerBoundary key={current.entry.path} onClose={closeAll}>
                <Viewer entry={current.entry} />
              </ViewerBoundary>
              {/* The file it was opened over stays mounted underneath, as it was left. */}
              <InnerLayer
                layer={inner.top}
                overlay={value}
                onClose={inner.closeTop}
                onStep={inner.stepTop}
              />
            </>
          ) : (
            <Centered>
              <Spinner />
            </Centered>
          )}
        </Suspense>
      </OverlayContext>
    </div>
  );
}
