import { Suspense, useEffect, useMemo, useState } from 'react';

import { Spinner } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { PreviewDock } from './PreviewDock';
import { usePlayback } from './PlaybackProvider';
import { usePreview, type PreviewItem } from './PreviewProvider';
import { viewerComponentFor, viewerKindFor, viewerLayoutFor } from './viewerFor';

/**
 * The preview surface: one overlay for the active preview, plus the dock of
 * minimised ones. Mounted at the shell level rather than inside the explorer,
 * so a pinned preview survives navigation.
 */
export function PreviewLayer() {
  const { items, active, open, close, minimize, restore, togglePin, step } = usePreview();
  const playback = usePlayback();

  // A compact `panel` viewer can be grown to full; reset when the preview changes.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [active?.id]);

  const kind = active ? viewerKindFor(active.entry) : null;
  const layout = kind ? viewerLayoutFor(kind) : 'full';
  const isPanel = layout === 'panel' && !expanded;

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
            'fixed inset-0 z-50 flex justify-center',
            // A panel sits at the bottom on a phone (a sheet) and centred on a
            // wider screen; a full viewer is always centred.
            isPanel ? 'items-end sm:items-center' : 'items-center',
            'bg-[--scrim] backdrop-blur-[2px]',
            'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150',
          )}
          onPointerDown={event => {
            if (event.target === event.currentTarget) close(active.id);
          }}
        >
          <div
            className={cn(
              'flex flex-col overflow-hidden bg-overlay shadow-2xl',
              isPanel
                ? [
                    // Phone: full-width bottom sheet. Wider: a compact card whose
                    // height fits its content rather than filling the screen.
                    'h-[80vh] max-h-[34rem] w-full rounded-t-2xl border-t border-subtle',
                    'sm:h-auto sm:max-h-[85vh] sm:w-[26rem] sm:rounded-xl sm:border',
                    'motion-safe:animate-in motion-safe:slide-in-from-bottom-4 sm:motion-safe:zoom-in-95',
                  ]
                : [
                    'h-full w-full',
                    'sm:h-[calc(100%-3rem)] sm:w-[calc(100%-3rem)] sm:rounded-xl sm:border sm:border-subtle',
                  ],
            )}
          >
            <Suspense
              fallback={
                <div className="flex min-h-[12rem] flex-1 items-center justify-center">
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
        {...(layout === 'panel'
          ? { isExpanded: expanded, onToggleExpand: () => setExpanded(value => !value) }
          : {})}
      />
    );
  }
}
