import { useEffect, useRef } from 'react';
import { BookOpen } from 'lucide-react';

import { Spinner, StatusPanel } from '@/components/ui/primitives';
import { mediaUrls } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useInputCapability } from '@/hooks/useInputCapability';
import { PageJump } from '../PageJump';
import { ViewerChrome } from '../ViewerChrome';
import { ComicControls } from './comic/ComicControls';
import { useComicReader, type Fit } from './comic/useComicReader';
import type { ViewerProps } from './types';

/** A swipe shorter than this is a tap that wandered, not a page turn. */
const SWIPE_THRESHOLD_PX = 48;

const FIT_CLASS: Record<Fit, string> = {
  height: 'max-h-full w-auto object-contain',
  width: 'h-auto w-full object-contain',
  original: 'max-h-none max-w-none',
};

export default function ComicViewer({ item, onStep, ...chrome }: ViewerProps) {
  const reader = useComicReader(item.entry.path);
  const { coarse } = useInputCapability();
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const { turn, goTo, pageCount, pageIndex, flow, data: manifest } = reader;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;

      // Arrow keys follow the pages as they sit on screen, so in right-to-left
      // mode the left arrow advances — which is what the printed book does.
      const forward = flow === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
      const backward = flow === 'rtl' ? 'ArrowRight' : 'ArrowLeft';

      const actions: Record<string, () => void> = {
        [forward]: () => turn(1),
        [backward]: () => turn(-1),
        PageDown: () => turn(1),
        PageUp: () => turn(-1),
        ' ': () => turn(1),
        Home: () => goTo(0),
        End: () => goTo(pageCount - 1),
      };

      const action = actions[event.key];
      if (action) {
        event.preventDefault();
        action();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flow, goTo, pageCount, turn]);

  return (
    <ViewerChrome
      item={item}
      onStep={onStep}
      contentClassName="group/viewer bg-hearth-950"
      footer={
        pageCount > 1 ? (
          <ReadingProgress
            pageIndex={pageIndex}
            pageCount={pageCount}
            onScrub={goTo}
            showHandle={coarse}
          />
        ) : null
      }
      controls={
        <ComicControls
          spread={reader.spread}
          fit={reader.fit}
          flow={reader.flow}
          onSpread={reader.setSpread}
          onFit={reader.setFit}
          onFlow={reader.setFlow}
        />
      }
      {...chrome}
    >
      {reader.isPending ? (
        <div className="flex h-full items-center justify-center">
          <Spinner className="h-6 w-6" />
        </div>
      ) : reader.error || !manifest ? (
        <StatusPanel
          icon={<BookOpen className="h-8 w-8" />}
          title="Could not open this comic"
          description={reader.error instanceof Error ? reader.error.message : undefined}
        />
      ) : (
        <>
          <div
            className={cn(
              'flex h-full w-full justify-center gap-0.5',
              // Only "fit height" guarantees the page fits; the other two modes
              // deliberately overflow and must be scrollable, or the bottom of
              // the page becomes unreachable. `items-start` because a flex item
              // centred inside a scroll container has its overflow clipped
              // above the scroll origin.
              reader.fit === 'height'
                ? 'items-center overflow-hidden'
                : 'items-start overflow-auto',
              // Leave room for the scrubber. It floats, so without this the
              // bottom strip of every page sits behind it — and on a comic that
              // strip is a panel, not margin.
              pageCount > 1 && 'pb-12',
            )}
            onClick={event => {
              // Tap the leading or trailing edge to turn. The middle third is
              // left alone so it can toggle the chrome without turning a page.
              const bounds = event.currentTarget.getBoundingClientRect();
              const position = (event.clientX - bounds.left) / bounds.width;
              // The middle third is left alone so it can bubble up to the
              // chrome and toggle the controls instead of turning a page.
              if (position > 0.3 && position < 0.7) return;

              event.stopPropagation();
              const towardsEnd = flow === 'rtl' ? position <= 0.3 : position >= 0.7;
              turn(towardsEnd ? 1 : -1);
            }}
            onTouchStart={event => {
              const touch = event.touches[0];
              if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
            }}
            onTouchEnd={event => {
              const start = touchStart.current;
              const touch = event.changedTouches[0];
              touchStart.current = null;
              if (!start || !touch) return;

              const dx = touch.clientX - start.x;
              const dy = touch.clientY - start.y;
              if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;

              // Swiping left pulls the next page in from the right — reversed
              // when the book runs the other way.
              const towardsEnd = flow === 'rtl' ? dx > 0 : dx < 0;
              turn(towardsEnd ? 1 : -1);
            }}
          >
            {reader.visible.map(page => (
              <img
                key={page}
                src={mediaUrls.comicPage(manifest.key, page)}
                alt={`Page ${manifest.pages.indexOf(page) + 1}`}
                draggable={false}
                className={cn(
                  FIT_CLASS[reader.fit],
                  reader.spread === 'double' && reader.fit !== 'original' && 'max-w-[50%]',
                )}
              />
            ))}
          </div>
        </>
      )}
    </ViewerChrome>
  );
}

/**
 * A thin scrubber pinned under the page. It doubles as the "how much is left"
 * indicator that a paper book gives you for free, which is the one thing a
 * digital reader most obviously lacks.
 */
function ReadingProgress({
  pageIndex,
  pageCount,
  onScrub,
  showHandle,
}: {
  pageIndex: number;
  pageCount: number;
  onScrub: (index: number) => void;
  showHandle: boolean;
}) {
  const percent = ((pageIndex + 1) / pageCount) * 100;

  return (
    <div className="px-3 pb-3">
      <div className="flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 backdrop-blur-sm">
        {/* One-based for the reader, zero-based for the array. */}
        <PageJump page={pageIndex + 1} total={pageCount} onJump={page => onScrub(page - 1)} />
        <input
          type="range"
          min={0}
          max={pageCount - 1}
          value={pageIndex}
          onChange={event => onScrub(Number(event.target.value))}
          aria-label="Jump to page"
          className={cn(
            'h-1.5 flex-1 cursor-pointer appearance-none rounded-full',
            // A visible thumb is needed where there is no cursor to aim with.
            showHandle && '[&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5',
          )}
          style={{
            background: `linear-gradient(to right, var(--color-ember-500) ${percent}%, rgb(255 255 255 / 0.25) ${percent}%)`,
            // Without this the thumb renders in the OS accent — a blue dot in a
            // room built entirely out of ember and warm neutrals.
            accentColor: 'var(--color-ember-500)',
          }}
        />
      </div>
    </div>
  );
}
