import { Suspense, useEffect, useMemo } from 'react';

import { Spinner } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { PreviewDock } from './PreviewDock';
import { usePlayback } from './PlaybackProvider';
import { usePreview, type PreviewItem } from './PreviewProvider';
import { viewerComponentFor, viewerKindFor } from './viewerFor';

/**
 * The preview surface: one overlay for the active preview, plus the dock of
 * minimised ones. Mounted at the shell level rather than inside the explorer,
 * so a pinned preview survives navigation.
 */
export function PreviewLayer() {
  const { items, active, open, close, minimize, restore, togglePin, step } = usePreview();
  const playback = usePlayback();

  /**
   * The dock holds every minimised preview, plus whatever audio is playing even
   * after its preview was closed — otherwise a track that keeps playing past a
   * close would have no visible control. Reopening its dock entry brings the
   * player back.
   */
  const dockItems = useMemo<PreviewItem[]>(() => {
    const minimized = items.filter(item => item.minimized);
    const track = playback.track;
    if (track && !items.some(item => item.id === track.path)) {
      minimized.push({ id: track.path, entry: track, minimized: true, pinned: true, gallery: [] });
    }
    return minimized;
  }, [items, playback.track]);

  // Escape closes the top preview — the single most-used way out.
  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && active) {
        event.preventDefault();
        close(active.id);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, close]);

  return (
    <>
      {active ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview of ${active.entry.name}`}
          className={cn(
            'fixed inset-0 z-50 flex items-center justify-center',
            'bg-[--scrim] backdrop-blur-[2px]',
            'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150',
          )}
          onPointerDown={event => {
            // Only a click on the scrim itself dismisses the preview.
            if (event.target === event.currentTarget) close(active.id);
          }}
        >
          <div
            className={cn(
              'flex h-full w-full flex-col overflow-hidden bg-overlay shadow-2xl',
              'sm:h-[calc(100%-3rem)] sm:w-[calc(100%-3rem)] sm:rounded-xl sm:border sm:border-subtle',
            )}
          >
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Spinner className="h-6 w-6" />
                </div>
              }
            >
              <ActiveViewer />
            </Suspense>
          </div>
        </div>
      ) : null}

      <PreviewDock
        items={dockItems}
        onRestore={id => {
          // A closed-but-playing track is no longer an item; reopen it.
          if (items.some(item => item.id === id)) restore(id);
          else if (playback.track) open(playback.track);
        }}
        onClose={id => {
          if (items.some(item => item.id === id)) close(id);
          else playback.stop();
        }}
      />
    </>
  );

  function ActiveViewer() {
    if (!active) return null;
    const Viewer = viewerComponentFor(viewerKindFor(active.entry));
    return (
      <Viewer
        // Remount on file change so each viewer starts from a clean state.
        key={active.id}
        item={active}
        onClose={() => close(active.id)}
        onMinimize={() => minimize(active.id)}
        onTogglePin={() => togglePin(active.id)}
        onStep={step}
      />
    );
  }
}
