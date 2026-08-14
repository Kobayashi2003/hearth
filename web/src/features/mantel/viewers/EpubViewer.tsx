import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookX, ChevronLeft, ChevronRight, List, Search, Settings2, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Spinner, StatusPanel, Tooltip } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { useAtLeast } from '@/hooks/useBreakpoint';
import { PageJump } from '../PageJump';
import { ViewerChrome } from '../ViewerChrome';
import { useEpubBook, type EpubSettings } from './epub/useEpubBook';
import { turnForSide } from './epub/epub-layout';
import { Contents, FindPanel, SettingsPanel, FONT_SIZES } from './epub/EpubPanels';
import { neighbour } from '@/lib/steps';
import type { ViewerProps } from './types';

type Panel = 'contents' | 'find' | 'settings' | null;

const PANEL_TITLES: Record<Exclude<Panel, null>, string> = {
  contents: 'Contents',
  find: 'Find in book',
  settings: 'Reading settings',
};

/**
 * EPUB reader. The book lifecycle lives in `useEpubBook` and the side panels in
 * `EpubPanels`; this renders them and owns the chrome.
 */
export default function EpubViewer({ item, onStep, ...chrome }: ViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [settings, setSettings] = useState<EpubSettings>({
    fontSizePercent: 100,
    fontFamily: null,
    lineHeight: 1.5,
    direction: 'auto',
    spread: 'none',
  });

  // A sidebar is right where there is width to spare; on a phone it would take
  // the whole screen, so panels arrive as a sheet over the page instead.
  const hasRoomForSidebar = useAtLeast('medium');

  const closePanel = useCallback(() => setPanel(null), []);
  const book = useEpubBook(item.entry.path, containerRef, settings, closePanel);
  const { turn, rtl, resizeTextRef, search } = book;

  const showPanel = useCallback(
    (next: Exclude<Panel, null>) => setPanel(current => (current === next ? null : next)),
    [],
  );

  /**
   * A comic's pages were drawn as spreads, so it opens as one unless the reader
   * says otherwise. Applied once: after that the choice is theirs, and a book
   * that re-asserted itself on every render could not be turned off.
   */
  const spreadChosen = useRef(false);
  useEffect(() => {
    if (spreadChosen.current) return;
    if (book.suggestedSpread === 'none') return;
    spreadChosen.current = true;
    setSettings(current => ({ ...current, spread: book.suggestedSpread }));
  }, [book.suggestedSpread]);

  const step = useCallback(
    (delta: 1 | -1) =>
      setSettings(current => ({
        ...current,
        fontSizePercent: neighbour(FONT_SIZES, current.fontSizePercent, delta),
      })),
    [],
  );
  // Handed to the listeners inside the book's iframes, which are installed once
  // and would otherwise be holding the first render's setter forever.
  resizeTextRef.current = step;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // `closest` is checked for, not assumed: a key forwarded out of the
      // book's iframe is dispatched on the document, whose target is not an
      // element, and calling it blindly throws — which silently killed every
      // shortcut rather than just this guard.
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select')) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        setPanel('find');
      } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        turn(turnForSide('right', rtl));
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        turn(turnForSide('left', rtl));
      } else return;
      event.preventDefault();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [turn, rtl]);

  const openTo = (href: string) => {
    book.goTo(href);
    setPanel(null);
  };

  // Only a fixed-layout book knows its page shape, and only a spread needs it:
  // one page at a time is already centred in the window.
  const spreadWidth =
    book.pageAspect && settings.spread === 'auto' ? book.pageAspect * 2 : null;

  const panelBody = useMemo(() => {
    if (panel === 'contents') return <Contents entries={book.toc} onSelect={openTo} />;
    if (panel === 'find') {
      return (
        <FindPanel
          query={search.query}
          hits={search.hits}
          index={search.index}
          isSearching={search.isSearching}
          onQueryChange={search.setQuery}
          onRun={() => void search.run(search.query)}
          onGoTo={search.goToHit}
          onClear={search.reset}
        />
      );
    }
    if (panel === 'settings') {
      return (
        <SettingsPanel
          settings={settings}
          onChange={next => {
            spreadChosen.current = true;
            setSettings(next);
          }}
          detectedRtl={book.rtl}
        />
      );
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, book.toc, book.rtl, settings, search]);

  return (
    <ViewerChrome
      flow="document"
      item={item}
      onStep={onStep}
      // The page-turn arrows below belong to the book; the chrome's would step
      // to the next file, a keystroke away from the one that turns a page.
      galleryArrows="none"
      footer={
        book.status === 'ready' ? (
          <div className="px-3 pb-3">
            <div className="flex items-center gap-2 rounded-full bg-black/45 px-2 py-1 backdrop-blur-sm">
              <PageButton side="left" rtl={rtl} onClick={turn} />

              <PageJump
                page={book.position.page}
                total={book.position.totalPages}
                suffix={book.position.chapter}
                onJump={book.goToPage}
              />

              <div className="h-1 min-w-8 flex-1 overflow-hidden rounded-full bg-white/25">
                <div
                  className={cn(
                    'h-full bg-ember-500 transition-[width] duration-[var(--duration-quick)]',
                    // A right-to-left book fills from the right, because that is
                    // the edge its reader started at.
                    rtl && 'ml-auto',
                  )}
                  style={{ width: `${Math.max(1, book.position.percent)}%` }}
                />
              </div>

              <span className="tabular shrink-0 text-[0.6875rem] text-white/80">
                {book.position.percent}%
              </span>

              <PageButton side="right" rtl={rtl} onClick={turn} />
            </div>
          </div>
        ) : null
      }
      controls={
        <div className="flex items-center gap-0.5">
          <PanelButton
            label="Contents"
            icon={List}
            isOpen={panel === 'contents'}
            onClick={() => showPanel('contents')}
          />
          <PanelButton
            label="Find in book"
            icon={Search}
            isOpen={panel === 'find'}
            onClick={() => showPanel('find')}
          />
          <PanelButton
            label="Reading settings"
            icon={Settings2}
            isOpen={panel === 'settings'}
            onClick={() => showPanel('settings')}
          />
        </div>
      }
      {...chrome}
    >
      <div className="flex h-full min-h-0">
        {panel && hasRoomForSidebar ? (
          <div className="flex w-64 shrink-0 flex-col border-r border-subtle bg-sunken">
            {panelBody}
          </div>
        ) : null}

        <div className="relative flex min-w-0 flex-1 justify-center bg-surface">
          {/*
            A two-page spread is given exactly the shape of the two pages it
            holds, so they meet at the spine. Left to fill the window, epub.js
            centres each page within its own half and a comic opens as two
            pictures separated by a band of empty white.
          */}
          <div
            ref={containerRef}
            className="h-full w-full"
            style={
              spreadWidth
                ? { width: 'auto', aspectRatio: String(spreadWidth), maxWidth: '100%' }
                : undefined
            }
          />

          {book.status === 'loading' ? (
            <div className="absolute inset-0 flex items-center justify-center bg-surface">
              <Spinner className="h-6 w-6" />
            </div>
          ) : null}

          {book.status === 'error' ? (
            <div className="absolute inset-0 bg-surface">
              <StatusPanel
                icon={<BookX className="h-8 w-8" />}
                title="This book could not be opened"
                description={book.errorMessage ?? undefined}
              />
            </div>
          ) : null}
        </div>
      </div>

      {panel && !hasRoomForSidebar ? (
        <div className="absolute inset-0 z-30 flex flex-col bg-[var(--scrim)]" data-chrome>
          <button type="button" className="flex-1" aria-label="Close panel" onClick={closePanel} />
          <div className="flex max-h-[70%] flex-col overflow-hidden rounded-t-2xl border-t border-subtle bg-overlay motion-safe:animate-in motion-safe:slide-in-from-bottom-4">
            <div className="flex items-center justify-between border-b border-subtle px-3 py-2">
              <h3 className="text-sm font-medium">{PANEL_TITLES[panel]}</h3>
              <Button variant="ghost" size="icon" onClick={closePanel} aria-label="Close panel">
                <X className="h-4 w-4" />
              </Button>
            </div>
            {panelBody}
          </div>
        </div>
      ) : null}
    </ViewerChrome>
  );
}

function PanelButton({
  label,
  icon: Icon,
  isOpen,
  onClick,
}: {
  label: string;
  icon: typeof List;
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label}>
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        aria-pressed={isOpen}
        aria-label={label}
        className={cn(isOpen && 'text-accent')}
      >
        <Icon className="h-4 w-4" />
      </Button>
    </Tooltip>
  );
}

/**
 * A page-turn arrow that points where the page will come from, not where the
 * delta is: in a right-to-left book the left arrow advances.
 */
function PageButton({
  side,
  rtl,
  onClick,
}: {
  side: 'left' | 'right';
  rtl: boolean;
  onClick: (delta: 1 | -1) => void;
}) {
  const delta = turnForSide(side, rtl);
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  const label = delta === 1 ? 'Next page' : 'Previous page';

  return (
    <Tooltip label={label}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onClick(delta)}
        aria-label={label}
        className="h-7 w-7 shrink-0 text-white hover:bg-white/15 hover:text-white"
      >
        <Icon className="h-4 w-4" />
      </Button>
    </Tooltip>
  );
}
