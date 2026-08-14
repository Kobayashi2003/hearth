import type { ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Minimize2,
  Minus,
  Pin,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatSize, parentPathOf } from '@/lib/format';
import { mediaUrls } from '@/lib/api';
import { useChromeIdle } from './useChromeIdle';
import type { PreviewItem } from './PreviewProvider';

/**
 * Every viewer wears the same chrome: a header carrying title, containing
 * folder, viewer-specific controls and the same three window controls in the
 * same place, and an optional footer for whatever that viewer scrubs through.
 * The previous UI put these in a different spot per viewer, which is why nobody
 * found pin or minimise — here they are labelled and always in the same corner.
 *
 * In a full-screen viewer the chrome retreats when nothing is happening and
 * returns on a movement, a tap, or a key. Content first; the furniture is only
 * there when you reach for it.
 */
export function ViewerChrome({
  item,
  controls,
  footer,
  flow = 'bleed',
  onClose,
  onMinimize,
  onTogglePin,
  onStep,
  galleryArrows = 'overlay',
  isFull,
  onToggleFull,
  fullscreenMode,
  isCompact,
  children,
  contentClassName,
}: {
  item: PreviewItem;
  /** Viewer-specific controls, rendered before the window controls. */
  controls?: ReactNode;
  /**
   * How the content wants the chrome to behave.
   *
   * - `bleed` — the content is a picture that fits or is centred, so the chrome
   *   floats over it and retreats when idle. Immersion is the point.
   * - `document` — the content is text that scrolls under its own steam. The
   *   chrome stays in normal flow, because a floating header over a scrolling
   *   document hides the line you are reading and no amount of padding fixes
   *   that without making the text jump every time the chrome comes and goes.
   */
  flow?: 'bleed' | 'document';
  /** A bottom bar owned by the viewer — a page scrubber, a transport. */
  footer?: ReactNode;
  onClose: () => void;
  onMinimize: () => void;
  onTogglePin: () => void;
  onStep?: (delta: number) => void;
  /**
   * Where file-stepping lives. `none` for a viewer that already has a control
   * bar of its own — a second pair of arrows floating over the video would
   * duplicate the ones in its transport, and land on top of them.
   */
  galleryArrows?: 'overlay' | 'none';
  /** See `ViewerProps` — the window's fullness, and the control for it. */
  isFull: boolean;
  onToggleFull: () => void;
  fullscreenMode: 'browser' | 'window';
  isCompact: boolean;
  children: ReactNode;
  contentClassName?: string;
}) {
  const folder = parentPathOf(item.entry.path);
  const canStep = Boolean(onStep) && item.gallery.length > 1 && galleryArrows === 'overlay';

  // A compact panel keeps its chrome: it is a small card, and hiding the header
  // of something that is already only 26rem wide gains nothing and loses the
  // only way out. A panel grown to full screen is immersive like any other.
  const isImmersive = flow === 'bleed' && !isCompact;
  const chrome = useChromeIdle(isImmersive);
  const hidden = isImmersive && !chrome.visible;

  return (
    // `relative` so an immersive header can float over the content rather than
    // taking a strip of it.
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <header
        onPointerDown={chrome.wake}
        className={cn(
          'flex h-12 shrink-0 items-center gap-2 border-b border-subtle bg-overlay px-2 sm:px-3',
          isImmersive &&
            'absolute inset-x-0 top-0 z-20 border-transparent bg-overlay/85 backdrop-blur',
          'transition-[opacity,translate] duration-[var(--duration-quick)] ease-[var(--ease-out-quick)]',
          hidden && 'pointer-events-none -translate-y-full opacity-0',
        )}
        // Hidden chrome must not swallow the tap that is meant to reveal it.
        // `pointer-events-none` is what actually stops the clicks; `inert` and
        // `aria-hidden` keep it out of the tab order and off screen readers.
        // Without this a tap meant for the page lands on an invisible Close.
        inert={hidden}
        aria-hidden={hidden}
      >
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium text-primary" title={item.entry.name}>
            {item.entry.name}
          </h2>
          <p className="truncate font-mono text-[0.6875rem] text-muted">
            {folder || 'Home'} · <span className="tabular">{formatSize(item.entry.size)}</span>
          </p>
        </div>

        {controls}

        <div className="flex items-center gap-0.5">
          <Tooltip label="Download">
            <a
              href={mediaUrls.download(item.entry.path)}
              download={item.entry.name}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-secondary hover:bg-sunken hover:text-primary"
              aria-label="Download this file"
            >
              <Download className="h-4 w-4" />
            </a>
          </Tooltip>

          <Tooltip label={fullLabel(isFull, fullscreenMode)}>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleFull}
              aria-pressed={isFull}
              aria-label={fullLabel(isFull, fullscreenMode)}
            >
              {isFull ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </Tooltip>

          <Tooltip
            label={
              item.pinned
                ? 'Unpin — close when leaving the folder'
                : 'Pin — keep open while browsing'
            }
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={onTogglePin}
              aria-pressed={item.pinned}
              aria-label={item.pinned ? 'Unpin this preview' : 'Pin this preview'}
              className={cn(item.pinned && 'text-accent')}
            >
              <Pin className={cn('h-4 w-4', item.pinned && 'fill-current')} />
            </Button>
          </Tooltip>

          <Tooltip label="Minimise to the dock">
            <Button
              variant="ghost"
              size="icon"
              onClick={onMinimize}
              aria-label="Minimise this preview"
            >
              <Minus className="h-4 w-4" />
            </Button>
          </Tooltip>

          <Tooltip label="Close">
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close this preview">
              <X className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      </header>

      <div
        className={cn('relative min-h-0 flex-1 overflow-hidden', contentClassName)}
        onClick={event => {
          if (!chrome.coarse) return;
          // A viewer that handled the tap itself — turning a page, say — stops
          // propagation before it gets here. What remains is a tap on the
          // content, which means "show me the controls". Taps that landed on a
          // control are not that.
          const target = event.target as HTMLElement;
          if (target.closest('button, a, input, select, textarea, [data-chrome]')) return;
          chrome.toggle();
        }}
      >
        {children}

        {canStep ? (
          <>
            <GalleryStep direction="previous" onClick={() => onStep?.(-1)} hidden={hidden} />
            <GalleryStep direction="next" onClick={() => onStep?.(1)} hidden={hidden} />
          </>
        ) : null}
      </div>

      {footer ? (
        <div
          data-chrome
          // Held open while a scrubber is being dragged: on a coarse pointer
          // there is no movement signal to keep it awake, so a long drag would
          // otherwise watch the control vanish under the thumb.
          onPointerDown={() => chrome.hold(true)}
          onPointerUp={() => chrome.hold(false)}
          onPointerCancel={() => chrome.hold(false)}
          className={cn(
            'z-20',
            // Over the content when it is a picture; below it when it is text,
            // for the same reason the header is: a bar floating across the last
            // line of a page is a bar covering what you are reading.
            isImmersive ? 'absolute inset-x-0 bottom-0' : 'border-t border-subtle bg-overlay',
            'transition-[opacity,translate] duration-[var(--duration-quick)] ease-[var(--ease-out-quick)]',
            hidden && 'pointer-events-none translate-y-full opacity-0',
          )}
          // `pointer-events-none` is what actually stops the clicks; `inert` and
          // `aria-hidden` keep it out of the tab order and off screen readers.
          // Without this a tap meant for the page lands on an invisible Close.
          inert={hidden}
          aria-hidden={hidden}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}

/**
 * What the full-screen control promises. "Fullscreen" is only said when the
 * browser's own fullscreen is what will happen; filling the window leaves the
 * tab strip in place and should not claim otherwise.
 */
function fullLabel(isFull: boolean, mode: 'browser' | 'window'): string {
  if (mode === 'browser') return isFull ? 'Leave fullscreen' : 'Fullscreen';
  return isFull ? 'Restore the window' : 'Fill the window';
}

/**
 * Gallery arrows — these step between *files*, not pages. On a pointer device
 * they stay out of the way and appear on hover; on a touch device — where there
 * is no hover — they follow the rest of the chrome, since otherwise there would
 * be no way to step through the gallery at all.
 */
function GalleryStep({
  direction,
  onClick,
  hidden,
}: {
  direction: 'previous' | 'next';
  onClick: () => void;
  hidden: boolean;
}) {
  const Icon = direction === 'previous' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${direction === 'previous' ? 'Previous' : 'Next'} file`}
      className={cn(
        'absolute top-1/2 z-10 flex h-14 w-11 -translate-y-1/2 items-center justify-center',
        'rounded-md bg-black/35 text-white/90 backdrop-blur-sm transition-opacity',
        'duration-[var(--duration-quick)] hover:bg-black/55 focus-visible:opacity-100',
        // Hidden until hover on fine pointers; tied to the chrome on touch.
        'opacity-0 group-hover/viewer:opacity-100 [@media(pointer:coarse)]:opacity-100',
        hidden && 'pointer-events-none !opacity-0',
        direction === 'previous' ? 'left-2' : 'right-2',
      )}
    >
      <Icon className="h-6 w-6" />
    </button>
  );
}
