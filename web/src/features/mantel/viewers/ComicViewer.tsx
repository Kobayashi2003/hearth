import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Columns2, Square } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Spinner, StatusPanel, Tooltip } from '@/components/ui/primitives';
import { api, mediaUrls } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ViewerChrome } from '../ViewerChrome';
import type { ViewerProps } from './types';

/** Pages fetched ahead of the current one, so turning a page is instant. */
const PRELOAD_AHEAD = 3;

type Spread = 'single' | 'double';

export default function ComicViewer({ item, onStep, ...chrome }: ViewerProps) {
  const path = item.entry.path;
  const [pageIndex, setPageIndex] = useState(0);
  const [spread, setSpread] = useState<Spread>('single');

  const { data, isPending, error } = useQuery({
    queryKey: ['comic', path],
    queryFn: ({ signal }) => api.openComic(path, signal),
    staleTime: Infinity,
  });

  useEffect(() => setPageIndex(0), [path]);

  const pageCount = data?.pageCount ?? 0;
  const step = spread === 'double' ? 2 : 1;

  const goTo = useCallback(
    (index: number) => setPageIndex(Math.max(0, Math.min(pageCount - 1, index))),
    [pageCount],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;
      const actions: Record<string, () => void> = {
        ArrowRight: () => goTo(pageIndex + step),
        ArrowLeft: () => goTo(pageIndex - step),
        PageDown: () => goTo(pageIndex + step),
        PageUp: () => goTo(pageIndex - step),
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
  }, [goTo, pageIndex, step, pageCount]);

  // Warm the next few pages in the browser cache.
  useEffect(() => {
    if (!data) return;
    for (let offset = 1; offset <= PRELOAD_AHEAD; offset += 1) {
      const page = data.pages[pageIndex + offset];
      if (page) new Image().src = mediaUrls.comicPage(data.key, page);
    }
  }, [data, pageIndex]);

  const visiblePages = data
    ? data.pages.slice(pageIndex, pageIndex + step).filter(Boolean)
    : [];

  return (
    <ViewerChrome
      item={item}
      onStep={onStep}
      contentClassName="group/viewer bg-hearth-950"
      controls={
        <div className="flex items-center gap-1">
          <Tooltip label={spread === 'single' ? 'Single page' : 'Two-page spread'}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSpread(current => (current === 'single' ? 'double' : 'single'))}
              aria-label="Toggle page spread"
            >
              {spread === 'single' ? <Square className="h-4 w-4" /> : <Columns2 className="h-4 w-4" />}
            </Button>
          </Tooltip>

          <input
            type="number"
            min={1}
            max={pageCount || 1}
            value={pageIndex + 1}
            onChange={event => goTo(Number(event.target.value) - 1)}
            aria-label="Page number"
            className="tabular h-8 w-16 rounded-md border border-subtle bg-raised px-2 text-center text-xs"
          />
          <span className="tabular text-xs text-muted">/ {pageCount}</span>
        </div>
      }
      {...chrome}
    >
      {isPending ? (
        <div className="flex h-full items-center justify-center">
          <Spinner className="h-6 w-6" />
        </div>
      ) : error || !data ? (
        <StatusPanel
          icon={<BookOpen className="h-8 w-8" />}
          title="Could not open this comic"
          description={error instanceof Error ? error.message : undefined}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center gap-1 overflow-hidden"
          onClick={event => {
            // Tap the left or right half to turn the page — the gesture a
            // reader expects on a phone.
            const bounds = event.currentTarget.getBoundingClientRect();
            const isLeftHalf = event.clientX - bounds.left < bounds.width / 2;
            goTo(pageIndex + (isLeftHalf ? -step : step));
          }}
        >
          {visiblePages.map(page => (
            <img
              key={page}
              src={mediaUrls.comicPage(data.key, page)}
              alt={`Page ${data.pages.indexOf(page) + 1}`}
              className={cn('max-h-full object-contain', spread === 'double' ? 'max-w-[50%]' : 'max-w-full')}
            />
          ))}
        </div>
      )}
    </ViewerChrome>
  );
}
