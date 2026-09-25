import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookImage, Settings2 } from 'lucide-react';

import { api, mediaUrls } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useRemembered } from '@/lib/storage';
import { percentOf, useProgress } from '@/features/progress/progress';
import { Button } from '@/ui/Button';
import { Centered, Notice, Spinner } from '@/ui/Feedback';
import { Menu, MenuChoice, MenuLabel, MenuSeparator } from '@/ui/Menu';
import { isTypingTarget } from '../PreviewOverlay';
import { useIdle, ViewerFrame } from '../ViewerFrame';
import type { ViewerProps } from '../viewers';

type Spread = 'single' | 'double';
type Fit = 'height' | 'width';
type Direction = 'ltr' | 'rtl';

const PRELOAD_AHEAD = 4;

/** Also used by the archive viewer to read a plain .zip of images as a comic. */
export function ComicReader({ entry }: ViewerProps) {
  const path = entry.path;
  const { progressFor, save } = useProgress();
  const [spread, setSpread] = useRemembered<Spread>('comic.spread', 'single');
  const [fit, setFit] = useRemembered<Fit>('comic.fit', 'height');
  const [direction, setDirection] = useRemembered<Direction>('comic.direction', 'rtl');
  const [page, setPage] = useState(0);
  const restored = useRef(false);
  const idle = useIdle(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { data, isPending, error } = useQuery({
    queryKey: ['comic', path],
    queryFn: ({ signal }) => api.openComic(path, signal),
    staleTime: Infinity,
    retry: false,
  });

  const count = data?.pageCount ?? 0;
  const perView = spread === 'double' ? 2 : 1;

  const goTo = useCallback(
    (index: number) => setPage(Math.max(0, Math.min(Math.max(0, count - 1), index))),
    [count],
  );
  /** `forward` means "later in the book", whichever side of the screen that is. */
  const turn = useCallback(
    (forward: boolean) => goTo(page + (forward ? perView : -perView)),
    [goTo, page, perView],
  );

  useEffect(() => {
    if (!data || restored.current) return;
    restored.current = true;
    const saved = progressFor(path);
    if (saved?.kind === 'page' && typeof saved.at === 'number' && saved.at < data.pageCount - 1)
      setPage(saved.at);
  }, [data, path, progressFor]);

  useEffect(() => {
    if (!data || !restored.current) return;
    save(path, {
      kind: 'page',
      at: page,
      total: count,
      percent: percentOf(page + perView, count),
      savedAt: Date.now(),
    });
    scrollRef.current?.scrollTo({ top: 0 });
    for (let offset = 1; offset <= PRELOAD_AHEAD; offset += 1) {
      const next = data.pages[page + perView - 1 + offset];
      if (next) new Image().src = mediaUrls.comicPage(data.key, next);
    }
  }, [data, page, count, perView, path, save]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      const physicalForward = direction === 'ltr';
      const keys: Record<string, () => void> = {
        ArrowRight: () => turn(physicalForward),
        ArrowLeft: () => turn(!physicalForward),
        PageDown: () => turn(true),
        PageUp: () => turn(false),
        ' ': () => turn(true),
        Home: () => goTo(0),
        End: () => goTo(count - 1),
      };
      const action = keys[event.key];
      if (action) {
        event.preventDefault();
        action();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [turn, goTo, count, direction]);

  const visible = data ? data.pages.slice(page, page + perView) : [];
  const ordered = direction === 'rtl' ? [...visible].reverse() : visible;

  const settings = (
    <Menu
      trigger={
        <Button variant="stage" size="icon" aria-label="Reading options" title="Reading options">
          <Settings2 />
        </Button>
      }
    >
      <MenuLabel>Pages</MenuLabel>
      <MenuChoice checked={spread === 'single'} onSelect={() => setSpread('single')}>
        One at a time
      </MenuChoice>
      <MenuChoice checked={spread === 'double'} onSelect={() => setSpread('double')}>
        Two side by side
      </MenuChoice>
      <MenuSeparator />
      <MenuLabel>Direction</MenuLabel>
      <MenuChoice checked={direction === 'rtl'} onSelect={() => setDirection('rtl')}>
        Right to left (manga)
      </MenuChoice>
      <MenuChoice checked={direction === 'ltr'} onSelect={() => setDirection('ltr')}>
        Left to right
      </MenuChoice>
      <MenuSeparator />
      <MenuLabel>Fit</MenuLabel>
      <MenuChoice checked={fit === 'height'} onSelect={() => setFit('height')}>
        Whole page
      </MenuChoice>
      <MenuChoice checked={fit === 'width'} onSelect={() => setFit('width')}>
        Fill width, scroll down
      </MenuChoice>
    </Menu>
  );

  return (
    <ViewerFrame
      entry={entry}
      immersive
      actions={settings}
      subtitle={
        count > 0
          ? `Page ${page + 1}${perView === 2 && page + 1 < count ? `–${page + 2}` : ''} of ${count}`
          : undefined
      }
    >
      {isPending ? (
        <Centered>
          <Spinner />
        </Centered>
      ) : error ? (
        <Notice icon={<BookImage />} title="This comic could not be opened" body={error.message} />
      ) : (
        <>
          <div
            ref={scrollRef}
            className={cn(
              'absolute inset-0 flex',
              fit === 'width' ? 'overflow-auto' : 'overflow-hidden',
            )}
          >
            <div
              className={cn(
                'm-auto flex',
                fit === 'height' ? 'h-full items-center' : 'w-full items-start',
              )}
            >
              {ordered.map(name => (
                <img
                  key={name}
                  src={mediaUrls.comicPage(data!.key, name)}
                  alt=""
                  draggable={false}
                  className={cn(
                    'select-none object-contain',
                    fit === 'height' ? 'max-h-full' : 'h-auto',
                    fit === 'height'
                      ? perView === 2
                        ? 'max-w-[50vw]'
                        : 'max-w-full'
                      : perView === 2
                        ? 'w-1/2'
                        : 'mx-auto w-full max-w-5xl',
                  )}
                />
              ))}
            </div>
          </div>
          {/* Tap zones: the outer thirds turn the page, following the reading direction. */}
          <button
            type="button"
            aria-label={direction === 'rtl' ? 'Next page' : 'Previous page'}
            className="absolute inset-y-14 left-0 w-1/3 cursor-w-resize"
            onClick={() => turn(direction === 'rtl')}
          />
          <button
            type="button"
            aria-label={direction === 'rtl' ? 'Previous page' : 'Next page'}
            className="absolute inset-y-14 right-0 w-1/3 cursor-e-resize"
            onClick={() => turn(direction !== 'rtl')}
          />
          <div
            className={cn(
              'absolute inset-x-0 bottom-0 z-20 flex items-center gap-3 bg-gradient-to-t from-black/75 to-transparent px-5 pb-4 pt-8 transition-opacity duration-300',
              idle && 'pointer-events-none opacity-0',
            )}
          >
            <input
              type="range"
              min={0}
              max={Math.max(0, count - 1)}
              value={page}
              onChange={event => goTo(Number(event.target.value))}
              aria-label="Page"
              dir={direction}
              className="flex-1 accent-[var(--ember)]"
            />
            <span className="tabular text-[12px] text-white/75">
              {page + 1} / {count}
            </span>
          </div>
        </>
      )}
    </ViewerFrame>
  );
}

export default ComicReader;
