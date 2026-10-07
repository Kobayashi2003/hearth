import type { CSSProperties, MutableRefObject, RefObject } from 'react';
import { Settings2 } from 'lucide-react';

import { mediaUrls } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button } from '@/ui/Button';
import { Menu, MenuChoice, MenuLabel, MenuSeparator } from '@/ui/Menu';

export type Spread = 'single' | 'double';
export type Fit = 'height' | 'width';
export type Direction = 'ltr' | 'rtl';

export function ReadingOptions({
  spread,
  direction,
  fit,
  onSpread,
  onDirection,
  onFit,
}: {
  spread: Spread;
  direction: Direction;
  fit: Fit;
  onSpread: (spread: Spread) => void;
  onDirection: (direction: Direction) => void;
  onFit: (fit: Fit) => void;
}) {
  return (
    <Menu
      trigger={
        <Button variant="stage" size="icon" aria-label="Reading options" title="Reading options">
          <Settings2 />
        </Button>
      }
    >
      <MenuLabel>Pages</MenuLabel>
      <MenuChoice checked={spread === 'single'} onSelect={() => onSpread('single')}>
        One at a time
      </MenuChoice>
      <MenuChoice checked={spread === 'double'} onSelect={() => onSpread('double')}>
        Two side by side
      </MenuChoice>
      <MenuSeparator />
      <MenuLabel>Direction</MenuLabel>
      <MenuChoice checked={direction === 'rtl'} onSelect={() => onDirection('rtl')}>
        Right to left (manga)
      </MenuChoice>
      <MenuChoice checked={direction === 'ltr'} onSelect={() => onDirection('ltr')}>
        Left to right
      </MenuChoice>
      <MenuSeparator />
      <MenuLabel>Fit</MenuLabel>
      <MenuChoice checked={fit === 'height'} onSelect={() => onFit('height')}>
        Whole page
      </MenuChoice>
      <MenuChoice checked={fit === 'width'} onSelect={() => onFit('width')}>
        Fill width, scroll down
      </MenuChoice>
    </Menu>
  );
}

/** The page or spread on show, sized for the fit and already in reading order. */
export function ComicPages({
  comicKey,
  names,
  fit,
  double,
  widthScale,
  scrollRef,
  landAtBottom,
}: {
  comicKey: string;
  names: string[];
  fit: Fit;
  double: boolean;
  widthScale: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  landAtBottom: MutableRefObject<boolean>;
}) {
  const byWidth = fit === 'width';
  const width: CSSProperties | undefined = byWidth
    ? {
        width: double ? `calc(50vw * ${widthScale})` : `calc(min(100vw, 64rem) * ${widthScale})`,
      }
    : undefined;

  return names.map(name => (
    <img
      key={name}
      src={mediaUrls.comicPage(comicKey, name)}
      alt=""
      draggable={false}
      onLoad={() => {
        const element = scrollRef.current;
        if (!landAtBottom.current || !element) return;
        element.scrollTop = element.scrollHeight;
        // Both halves of a spread load; after that the flag has done its job.
        window.setTimeout(() => (landAtBottom.current = false), 500);
      }}
      className={cn(
        'select-none object-contain',
        byWidth ? 'h-auto' : cn('max-h-full', double ? 'max-w-[50vw]' : 'max-w-full'),
      )}
      style={width}
    />
  ));
}

/** The outer thirds turn the page, following the reading direction. */
export function TapZones({
  direction,
  turn,
}: {
  direction: Direction;
  turn: (forward: boolean) => void;
}) {
  const rtl = direction === 'rtl';
  return (
    <>
      <button
        type="button"
        aria-label={rtl ? 'Next page' : 'Previous page'}
        className="absolute inset-y-14 left-0 w-1/3 cursor-w-resize"
        onClick={() => turn(rtl)}
      />
      <button
        type="button"
        aria-label={rtl ? 'Previous page' : 'Next page'}
        className="absolute inset-y-14 right-0 w-1/3 cursor-e-resize"
        onClick={() => turn(!rtl)}
      />
    </>
  );
}

export function PageSlider({
  page,
  count,
  direction,
  hidden,
  onPage,
}: {
  page: number;
  count: number;
  direction: Direction;
  hidden: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-0 z-20 flex items-center gap-3 bg-gradient-to-t from-black/75 to-transparent px-5 pb-4 pt-8 transition-opacity duration-300',
        hidden && 'pointer-events-none opacity-0',
      )}
    >
      <input
        type="range"
        min={0}
        max={Math.max(0, count - 1)}
        value={page}
        onChange={event => onPage(Number(event.target.value))}
        aria-label="Page"
        dir={direction}
        className="flex-1 accent-[var(--ember)]"
      />
      <span className="tabular text-[12px] text-white/75">
        {page + 1} / {count}
      </span>
    </div>
  );
}

/** "Page 3 of 40", or "Page 3–4 of 40" for a spread. */
export function pageLabel(page: number, count: number, double: boolean): string | undefined {
  if (count === 0) return undefined;
  const second = double && page + 1 < count ? `–${page + 2}` : '';
  return `Page ${page + 1}${second} of ${count}`;
}
