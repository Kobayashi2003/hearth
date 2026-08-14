import { Suspense, useCallback, useMemo } from 'react';

import { Spinner } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { useAtLeast } from '@/hooks/useBreakpoint';
import { useInputCapability } from '@/hooks/useInputCapability';
import { useShell } from '@/features/shell/AppShell';
import { PreviewDock } from './PreviewDock';
import { PreviewResizeHandles } from './PreviewResizeHandles';
import { usePlayback } from './PlaybackProvider';
import { usePreview, type PreviewItem } from './PreviewProvider';
import { useBackToClose } from './useBackToClose';
import { usePreviewKeys } from './usePreviewKeys';
import { DEFAULT_PREVIEW_SIZE, usePreviewWindow } from './usePreviewWindow';
import { panelWidthFor, viewerComponentFor, viewerKindFor, viewerLayoutFor } from './viewerFor';

/**
 * The preview surface: one window for the active preview, plus the dock of
 * minimised ones. Mounted at the shell level rather than inside the explorer,
 * so a pinned preview survives navigation.
 */
export function PreviewLayer() {
  const { items, active, open, close, minimize, restore, togglePin, sendToBackground, step } =
    usePreview();
  const playback = usePlayback();
  const { preferences } = useShell();

  /**
   * Closing a preview stops it unless it was pinned: sound that outlives its
   * window is startling if you did not ask for it. What a pinned close leaves
   * behind depends on the medium — audio to the dock, video to
   * picture-in-picture, which means keeping its element alive off screen.
   */
  const closeItem = useCallback(
    (item: PreviewItem) => {
      const kind = viewerKindFor(item.entry);
      if (item.pinned && kind === 'video' && document.pictureInPictureEnabled) {
        sendToBackground(item.id);
        return;
      }
      if (!item.pinned && kind === 'audio' && playback.track?.path === item.id) playback.stop();
      close(item.id);
    },
    [close, playback, sendToBackground],
  );

  const kind = active ? viewerKindFor(active.entry) : 'unsupported';
  const layout = viewerLayoutFor(kind);

  // A full-surface viewer opens at four fifths of the window; a `panel` viewer at
  // the size of its own contents. Either can be dragged, and then that is what it
  // opens at.
  const window_ = usePreviewWindow({
    kind,
    naturalSize: layout === 'panel' ? null : DEFAULT_PREVIEW_SIZE,
    preference: preferences.previewFullscreen,
    isOpen: active !== null,
  });

  const isRoomy = useAtLeast('medium');
  const { coarse } = useInputCapability();

  /** A panel still at its natural size is laid out by classes, not geometry. */
  const isNaturalPanel = layout === 'panel' && window_.size === null && !window_.isFull;

  /**
   * Below `medium` the preview *is* the screen: a window smaller than a phone's
   * display is a window with no room left inside it. Above it, geometry applies.
   */
  const isWindowed = isRoomy && !window_.isFull && !isNaturalPanel;

  // Sizing needs a pointer that can hover a 6px edge. Content-sized panels are
  // included — they are windows too — and the first drag measures whatever size
  // the panel is currently at.
  const canResize = isRoomy && !window_.isFull && !coarse;

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
      minimized.push({
        id: track.path,
        entry: track,
        minimized: true,
        pinned: true,
        background: false,
        gallery: [],
      });
    }
    return minimized;
  }, [items, playback.track]);

  const closeActive = useCallback(() => {
    if (active) closeItem(active);
  }, [active, closeItem]);

  /** Viewers kept mounted for a picture-in-picture window; see `background`. */
  const backgroundItems = useMemo(() => items.filter(item => item.background), [items]);

  // The browser Back button closes the overlay instead of leaving the page.
  useBackToClose(active !== null, closeActive);

  // Escape, minimise, pin and file-stepping — the keys that belong to the
  // window rather than to whichever viewer is inside it.
  usePreviewKeys(active !== null, {
    onClose: closeActive,
    onMinimize: () => active && minimize(active.id),
    onTogglePin: () => active && togglePin(active.id),
    ...(active && active.gallery.length > 1 ? { onStep: step } : {}),
  });

  return (
    <>
      {active ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview of ${active.entry.name}`}
          className={cn(
            'fixed inset-0 z-50 flex justify-center',
            // A natural-sized panel sits at the bottom on a phone (a sheet) and
            // centred on a wider screen; a sized window is always centred.
            isNaturalPanel ? 'items-end sm:items-center' : 'items-center',
            'bg-[var(--scrim)] backdrop-blur-[2px]',
            'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150',
          )}
          onPointerDown={event => {
            // Pinning a preview means "stop closing on me". Its first job is
            // this: a click outside no longer dismisses it, which is what makes
            // it safe to leave open while working in the folder behind it.
            if (event.target === event.currentTarget && !active.pinned) closeItem(active);
          }}
        >
          <div
            ref={window_.panelRef}
            // A container query root, so a viewer can lay itself out from the
            // size of the *window* rather than the size of the screen — the two
            // stopped being the same thing the moment the window became sizable.
            className={cn(
              '@container relative flex flex-col overflow-hidden bg-overlay shadow-2xl',
              isNaturalPanel
                ? [
                    // Phone: full-width bottom sheet. Wider: a compact card
                    // whose height fits its content.
                    'h-[80vh] max-h-[34rem] w-full rounded-t-2xl border-t border-subtle',
                    'sm:h-auto sm:max-h-[85vh] sm:rounded-xl sm:border',
                    panelWidthFor(kind),
                    'motion-safe:animate-in motion-safe:slide-in-from-bottom-4 sm:motion-safe:zoom-in-95',
                  ]
                : isWindowed
                  ? [
                      'rounded-xl border border-subtle',
                      'motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-150',
                    ]
                  : 'h-full w-full',
            )}
            style={isWindowed ? window_.style : undefined}
          >
            <Suspense
              fallback={
                <div className="flex min-h-[12rem] flex-1 items-center justify-center">
                  <Spinner className="h-6 w-6" />
                </div>
              }
            >
              {renderActiveViewer()}
            </Suspense>

            {canResize ? (
              <PreviewResizeHandles
                onResizeStart={window_.startResize}
                onReset={window_.resetSize}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <PreviewDock
        items={dockItems}
        onRestore={id => {
          // A closed-but-playing track is no longer an item; reopen it with the
          // album it was playing, or the playlist comes back empty.
          if (items.some(item => item.id === id)) restore(id);
          else if (playback.track) open(playback.track, playback.playlist);
        }}
        onClose={id => {
          const item = items.find(candidate => candidate.id === id);
          if (item) closeItem(item);
          else playback.stop();
        }}
      />

      {/* Nothing to see: a viewer kept alive only to hold a picture-in-picture
          window open, which dies with its element. Parked in a one-pixel box and
          `inert`, since as far as the page is concerned it is not there. */}
      {backgroundItems.map(item => (
        <div
          key={item.id}
          aria-hidden
          inert
          className="pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0"
        >
          <Suspense fallback={null}>{renderBackgroundViewer(item)}</Suspense>
        </div>
      ))}
    </>
  );

  /**
   * Called, not rendered as `<ActiveViewer />`. A component declared inside
   * another component is a new type on every render, so React would unmount and
   * remount the whole viewer on each state change — which, for the audio
   * viewer, meant its mount effect restarted the track every time playback
   * state moved. Calling it keeps the element's type the stable lazy viewer.
   */
  function renderActiveViewer() {
    if (!active) return null;
    const Viewer = viewerComponentFor(kind);
    return (
      <Viewer
        // Remount on file change so each viewer starts from a clean state.
        key={active.id}
        item={active}
        onClose={closeActive}
        onMinimize={() => minimize(active.id)}
        onTogglePin={() => togglePin(active.id)}
        onStep={step}
        isFull={window_.isFull}
        onToggleFull={window_.toggleFull}
        fullscreenMode={window_.fullscreenMode}
        isCompact={isNaturalPanel}
        isBackground={false}
      />
    );
  }

  // The same viewer, told it has no window: it keeps its playback and position
  // saving, and gives up the keyboard and the media session to whatever is.
  function renderBackgroundViewer(item: PreviewItem) {
    const Viewer = viewerComponentFor(viewerKindFor(item.entry));
    return (
      <Viewer
        key={item.id}
        item={item}
        // Dismissing the picture-in-picture window is how this preview ends.
        onClose={() => close(item.id)}
        onMinimize={() => minimize(item.id)}
        onTogglePin={() => togglePin(item.id)}
        onStep={step}
        isFull={false}
        onToggleFull={() => restore(item.id)}
        fullscreenMode="window"
        isCompact={false}
        isBackground
      />
    );
  }
}
