import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { TriangleAlert } from 'lucide-react';

import { viewerKindFor } from '@/lib/file-kind';
import { isTypingTarget } from '@/lib/keys';
import { useProgress } from '@/features/progress/progress';
import { Button } from '@/ui/Button';
import { Centered, Notice, Spinner } from '@/ui/Feedback';
import { OverlayContext, type OverlayValue } from './overlay';
import { usePreview } from './PreviewProvider';
import { useBackToClose } from './useBackToClose';
import { STEPS_WITH_ARROWS, VIEWERS } from './viewers';

/** The full-bleed stage a file is shown on. Mounted by the shell, above the routed page. */
export function PreviewOverlay() {
  const { current, close, step } = usePreview();
  const { isReady: progressReady } = useProgress();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setFullscreen] = useState(false);

  useBackToClose(current !== null, close);

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

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void rootRef.current?.requestFullscreen().catch(() => undefined);
  }, []);

  const kind = current ? viewerKindFor(current.entry) : 'none';
  const index = current ? current.gallery.findIndex(item => item.path === current.entry.path) : -1;
  const total = current?.gallery.length ?? 0;

  useEffect(() => {
    if (!current) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      if (event.key === 'Escape' && !document.fullscreenElement) {
        // Radix menus and dialogs inside the viewer handle their own Escape.
        if (
          document.querySelector(
            '[data-radix-popper-content-wrapper], [role="dialog"][data-state="open"]',
          )
        )
          return;
        event.preventDefault();
        closeAll();
      } else if (
        STEPS_WITH_ARROWS.has(kind) &&
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      ) {
        event.preventDefault();
        step(event.key === 'ArrowLeft' ? -1 : 1);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current, kind, closeAll, step]);

  const value = useMemo<OverlayValue>(
    () => ({ close: closeAll, step, index, total, isFullscreen, toggleFullscreen }),
    [closeAll, step, index, total, isFullscreen, toggleFullscreen],
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
      className="animate-fade fixed inset-0 z-50 flex flex-col bg-stage text-stage-ink"
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
            <ViewerBoundary key={current.entry.path} onClose={closeAll}>
              <Viewer entry={current.entry} />
            </ViewerBoundary>
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

/** A viewer that throws takes down only itself, not the explorer behind it. */
class ViewerBoundary extends Component<
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
