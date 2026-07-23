import { useCallback, useEffect, useRef, useState } from 'react';
import { BookX, List, Minus, Plus } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Spinner, StatusPanel, Tooltip } from '@/components/ui/primitives';
import { mediaUrls } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ViewerChrome } from '../ViewerChrome';
import type { ViewerProps } from './types';

interface TocEntry {
  label: string;
  href: string;
  depth: number;
}

const FONT_SIZES = [85, 100, 115, 130, 150];
const PROGRESS_KEY = 'hearth.epub-progress';

/**
 * EPUB reader.
 *
 * The book is fetched as an ArrayBuffer and handed to epub.js directly rather
 * than passing it a URL. Given a URL, epub.js resolves `container.xml` and the
 * OPF spine against that URL, and mis-resolves relative hrefs for books whose
 * internal layout is not the common one — which is the usual cause of a book
 * opening blank or throwing during parse. Loading the bytes leaves path
 * resolution entirely inside the archive, where it is unambiguous.
 */
export default function EpubViewer({ item, onStep, ...chrome }: ViewerProps) {
  const path = item.entry.path;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renditionRef = useRef<{ prev: () => void; next: () => void; destroy: () => void } | null>(null);

  const [toc, setToc] = useState<TocEntry[]>([]);
  const [isTocOpen, setTocOpen] = useState(false);
  const [fontSize, setFontSize] = useState(100);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let book: { destroy: () => void } | null = null;

    async function open() {
      setStatus('loading');
      setErrorMessage(null);

      try {
        const [{ default: ePub }, response] = await Promise.all([
          import('epubjs'),
          fetch(mediaUrls.raw(path), { credentials: 'same-origin' }),
        ]);
        if (!response.ok) throw new Error(`Could not download the book (${response.status})`);

        const bytes = await response.arrayBuffer();
        if (cancelled) return;

        const opened = ePub(bytes);
        book = opened as unknown as { destroy: () => void };

        const rendition = opened.renderTo(containerRef.current!, {
          width: '100%',
          height: '100%',
          // Scrolled flow avoids epub.js's column pagination, which breaks on
          // books that set their own page dimensions.
          flow: 'scrolled-doc',
          spread: 'none',
        });
        renditionRef.current = rendition as unknown as typeof renditionRef.current;

        const savedLocation = readProgress()[path];
        await rendition.display(savedLocation ?? undefined);
        if (cancelled) return;

        const navigation = await opened.loaded.navigation;
        setToc(flattenToc(navigation.toc as unknown as RawTocItem[], 0));

        rendition.on('relocated', (location: { start?: { cfi?: string } }) => {
          if (location.start?.cfi) saveProgress(path, location.start.cfi);
        });

        setStatus('ready');
      } catch (caught) {
        if (cancelled) return;
        setErrorMessage(caught instanceof Error ? caught.message : 'This book could not be parsed');
        setStatus('error');
      }
    }

    void open();
    return () => {
      cancelled = true;
      renditionRef.current?.destroy();
      renditionRef.current = null;
      book?.destroy();
    };
  }, [path]);

  // Applied separately so changing the size does not reload the book.
  useEffect(() => {
    const rendition = renditionRef.current as unknown as
      | { themes?: { fontSize: (value: string) => void } }
      | null;
    rendition?.themes?.fontSize(`${fontSize}%`);
  }, [fontSize, status]);

  const goTo = useCallback((href: string) => {
    const rendition = renditionRef.current as unknown as
      | { display: (target: string) => Promise<void> }
      | null;
    void rendition?.display(href);
    setTocOpen(false);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowRight' || event.key === 'PageDown') renditionRef.current?.next();
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') renditionRef.current?.prev();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <ViewerChrome
      item={item}
      onStep={onStep}
      controls={
        <div className="flex items-center gap-0.5">
          <Tooltip label="Smaller text">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setFontSize(current => previousIn(FONT_SIZES, current))}
              aria-label="Smaller text"
            >
              <Minus className="h-4 w-4" />
            </Button>
          </Tooltip>
          <span className="tabular w-10 text-center text-xs text-muted">{fontSize}%</span>
          <Tooltip label="Larger text">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setFontSize(current => nextIn(FONT_SIZES, current))}
              aria-label="Larger text"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip label="Contents">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTocOpen(open => !open)}
              aria-pressed={isTocOpen}
              aria-label="Contents"
              className={cn(isTocOpen && 'text-accent')}
            >
              <List className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      }
      {...chrome}
    >
      <div className="flex h-full min-h-0">
        {isTocOpen ? (
          <nav aria-label="Contents" className="w-64 shrink-0 overflow-y-auto border-r border-subtle bg-sunken py-2">
            {toc.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted">This book has no table of contents.</p>
            ) : (
              toc.map((entry, index) => (
                <button
                  key={`${entry.href}-${index}`}
                  type="button"
                  onClick={() => goTo(entry.href)}
                  className="block w-full truncate px-3 py-1.5 text-left text-[0.8125rem] text-secondary hover:bg-raised hover:text-primary"
                  style={{ paddingLeft: `${0.75 + entry.depth * 0.75}rem` }}
                >
                  {entry.label}
                </button>
              ))
            )}
          </nav>
        ) : null}

        <div className="relative min-w-0 flex-1 bg-surface">
          <div ref={containerRef} className="h-full w-full" />

          {status === 'loading' ? (
            <div className="absolute inset-0 flex items-center justify-center bg-surface">
              <Spinner className="h-6 w-6" />
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="absolute inset-0 bg-surface">
              <StatusPanel
                icon={<BookX className="h-8 w-8" />}
                title="This book could not be opened"
                description={errorMessage ?? undefined}
              />
            </div>
          ) : null}
        </div>
      </div>
    </ViewerChrome>
  );
}

interface RawTocItem {
  label?: string;
  href?: string;
  subitems?: RawTocItem[];
}

/** The nav document nests arbitrarily; depth is kept for indentation. */
function flattenToc(items: RawTocItem[], depth: number): TocEntry[] {
  return items.flatMap(entry => [
    { label: (entry.label ?? '').trim() || 'Untitled', href: entry.href ?? '', depth },
    ...flattenToc(entry.subitems ?? [], depth + 1),
  ]);
}

function readProgress(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function saveProgress(path: string, cfi: string): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify({ ...readProgress(), [path]: cfi }));
}

function nextIn(values: number[], current: number): number {
  return values[Math.min(values.length - 1, values.indexOf(current) + 1)] ?? current;
}

function previousIn(values: number[], current: number): number {
  return values[Math.max(0, values.indexOf(current) - 1)] ?? current;
}
