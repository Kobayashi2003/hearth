import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookImage } from 'lucide-react';

import { api } from '@/lib/api';
import { useRemembered } from '@/lib/storage';
import { Centered, Notice, Spinner } from '@/ui/Feedback';
import { useKeyBindings } from '@/lib/keys';
import { usePanZoom } from '../usePanZoom';
import { useIdle, ViewerFrame } from '../ViewerFrame';
import type { ViewerProps } from '../overlay';
import {
  ComicPages,
  PageSlider,
  pageLabel,
  ReadingOptions,
  TapZones,
  type Direction,
  type Fit,
  type Spread,
} from './comic/parts';
import { useComicPlace, useEdgeTurn } from './comic/reading';

/** Also used by the archive viewer to read a plain .zip of images as a comic. */
export function ComicReader({ entry }: ViewerProps) {
  const path = entry.path;
  const [spread, setSpread] = useRemembered<Spread>('comic.spread', 'single');
  const [fit, setFit] = useRemembered<Fit>('comic.fit', 'height');
  const [direction, setDirection] = useRemembered<Direction>('comic.direction', 'rtl');
  const [page, setPage] = useState(0);
  const idle = useIdle(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const [widthScale, setWidthScale] = useState(1);
  const landAtBottom = useRef(false);

  const { data, isPending, error } = useQuery({
    queryKey: ['comic', path],
    queryFn: ({ signal }) => api.openComic(path, signal),
    staleTime: Infinity,
    retry: false,
  });

  const count = data?.pageCount ?? 0;
  const double = spread === 'double';
  const perView = double ? 2 : 1;
  const byHeight = fit === 'height';

  const goTo = useCallback(
    (index: number) => setPage(Math.max(0, Math.min(Math.max(0, count - 1), index))),
    [count],
  );
  /** `forward` means "later in the book", whichever side of the screen that is. */
  const turn = useCallback(
    (forward: boolean) => goTo(page + (forward ? perView : -perView)),
    [goTo, page, perView],
  );

  const zoom = usePanZoom({
    stageRef: scrollRef,
    contentRef: pagesRef,
    enabled: byHeight,
    onWheelStep: step => turn(step > 0),
    // Swiping moves the page the way a paper page goes: toward the reading direction.
    onSwipe: side => turn(direction === 'rtl' ? side === 'right' : side === 'left'),
  });
  const resetZoom = zoom.reset;
  useEffect(() => resetZoom(), [page, fit, spread, resetZoom]);

  useEdgeTurn({
    scrollRef,
    enabled: !byHeight,
    ready: data,
    turn,
    scaleBy: setWidthScale,
    landAtBottom,
  });
  useComicPlace({ path, data, page, setPage, perView, scrollRef, landAtBottom });

  // A zoomed page takes the arrows first to look around (see usePanZoom).
  const forwardIsRight = direction === 'ltr';
  useKeyBindings([
    { key: 'ArrowRight', run: () => turn(forwardIsRight) },
    { key: 'ArrowLeft', run: () => turn(!forwardIsRight) },
    { key: ['PageDown', ' '], run: () => turn(true) },
    { key: 'PageUp', run: () => turn(false) },
    { key: 'Home', run: () => goTo(0) },
    { key: 'End', run: () => goTo(count - 1) },
  ]);

  const visible = data ? data.pages.slice(page, page + perView) : [];
  const ordered = direction === 'rtl' ? [...visible].reverse() : visible;

  return (
    <ViewerFrame
      entry={entry}
      immersive
      actions={
        <ReadingOptions
          spread={spread}
          direction={direction}
          fit={fit}
          onSpread={setSpread}
          onDirection={setDirection}
          onFit={setFit}
        />
      }
      subtitle={pageLabel(page, count, double)}
    >
      {isPending ? (
        <Centered>
          <Spinner />
        </Centered>
      ) : error ? (
        <Notice icon={<BookImage />} title="This comic could not be opened" body={error.message} />
      ) : (
        <>
          <ComicStage byHeight={byHeight} zoom={zoom} scrollRef={scrollRef} pagesRef={pagesRef}>
            <ComicPages
              comicKey={data.key}
              names={ordered}
              fit={fit}
              double={double}
              widthScale={widthScale}
              scrollRef={scrollRef}
              landAtBottom={landAtBottom}
            />
          </ComicStage>
          {zoom.isFit ? <TapZones direction={direction} turn={turn} /> : null}
          <PageSlider page={page} count={count} direction={direction} hidden={idle} onPage={goTo} />
        </>
      )}
    </ViewerFrame>
  );
}

/**
 * Whole page: the pages sit still and pan and zoom by hand. Fill width: they
 * scroll, and the wheel turns at either end (see useEdgeTurn).
 */
function ComicStage({
  byHeight,
  zoom,
  scrollRef,
  pagesRef,
  children,
}: {
  byHeight: boolean;
  zoom: ReturnType<typeof usePanZoom>;
  scrollRef: RefObject<HTMLDivElement | null>;
  pagesRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  if (!byHeight) {
    return (
      <div ref={scrollRef} className="absolute inset-0 flex overflow-auto">
        <div ref={pagesRef} className="m-auto flex w-max min-w-full items-start justify-center">
          {children}
        </div>
      </div>
    );
  }
  return (
    <div
      ref={scrollRef}
      className="absolute inset-0 flex touch-none select-none overflow-hidden"
      {...zoom.handlers}
      style={zoom.isFit ? undefined : { cursor: zoom.dragging ? 'grabbing' : 'grab' }}
    >
      <div
        ref={pagesRef}
        className="m-auto flex h-full items-center"
        style={{ transform: zoom.transform, transition: zoom.transition }}
      >
        {children}
      </div>
    </div>
  );
}
export default ComicReader;
