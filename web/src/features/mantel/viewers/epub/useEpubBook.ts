import { useCallback, useEffect, useRef, useState } from 'react';
import type { Progress } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';
import { useLedger } from '@/features/ledger/useLedger';
import {
  analyseLayout,
  chapterLabelFor,
  flattenToc,
  pageAspectOf,
  resolveSpread,
  type BookLike,
  type RawTocItem,
  type SpineItemLike,
  type TocEntry,
} from './epub-layout';
import {
  applyDirection,
  pageAspectFromDocument,
  relaxFixedPage,
  styleImages,
  unstretchSvg,
  unwrapOpsSwitch,
} from './epub-content';
import { epubThemeRules, EPUB_THEME_NAME } from './epub-theme';
import { installInputBridge, type EpubInputHandlers } from './epub-input';
import { flattenMixedLayout, turnBySpine, type NavigableRendition } from './epub-navigation';
import { patchSpineLookup, type SpineLike } from './epub-spine';
import {
  useEpubSearch,
  type AnnotatingRendition,
  type SearchableBook,
} from './useEpubSearch';

/**
 * Opening, paginating and remembering one EPUB.
 *
 * The book is fetched as an ArrayBuffer and handed to epub.js directly rather
 * than passing it a URL. Given a URL, epub.js resolves `container.xml` and the
 * OPF spine against that URL, and mis-resolves relative hrefs for books whose
 * internal layout is not the common one — the usual cause of a book opening
 * blank. Loading the bytes leaves path resolution inside the archive.
 */

export type { TocEntry } from './epub-layout';

export interface EpubSettings {
  fontSizePercent: number;
  fontFamily: string | null;
  lineHeight: number;
  /** `auto` follows the book's own spine direction. */
  direction: 'auto' | 'ltr' | 'rtl';
  spread: 'auto' | 'none';
}

export interface EpubPosition {
  percent: number;
  /** 1-based, once locations have been generated; 0 before that. */
  page: number;
  totalPages: number;
  chapter: string;
}

interface Rendition extends NavigableRendition, AnnotatingRendition {
  settings: { rtlScrollType?: string };
  reportLocation: () => void;
  manager?: { settings: { rtlScrollType?: string } } | null;
  prev: () => void;
  next: () => void;
  destroy: () => void;
  display: (target?: string | number) => Promise<void>;
  spread: (mode: string) => void;
  on: (event: string, handler: (payload: never) => void) => void;
  hooks: { content: { register: (fn: (contents: Contents) => void) => void } };
  themes: {
    fontSize: (value: string) => void;
    register: (name: string, rules: Record<string, Record<string, string>>) => void;
    select: (name: string) => void;
  };
}

interface Contents {
  document: Document;
}

interface RelocatedEvent {
  start?: { cfi?: string; index?: number; percentage?: number; location?: number; href?: string };
}

interface Book extends BookLike, SearchableBook {
  /** Resolves once the container, package document and spine are parsed. */
  ready: Promise<unknown>;
  spine?: BookLike['spine'] & Partial<SpineLike> & SearchableBook['spine'];
  destroy: () => void;
  renderTo: (element: HTMLElement, options: Record<string, unknown>) => Rendition;
  loaded: { navigation: Promise<{ toc: RawTocItem[] }> };
  locations: {
    generate: (chars: number) => Promise<unknown>;
    percentageFromCfi: (cfi: string) => number;
    length: () => number;
    cfiFromLocation?: (index: number) => string;
  };
}

/**
 * Characters per generated location. epub.js's own default; smaller is more
 * precise and slower, and this is already fine enough that a progress bar moves
 * visibly within a chapter.
 */
const LOCATION_CHARS = 1600;

export function useEpubBook(
  path: string,
  container: React.RefObject<HTMLDivElement | null>,
  settings: EpubSettings,
  onTapCentre?: () => void,
) {
  const { progressFor, saveProgress, markOpened } = useLedger();

  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  /** Read once at open; later reads would fight the position being written. */
  const savedRef = useRef<Progress | undefined>(undefined);

  const [toc, setToc] = useState<TocEntry[]>([]);
  const [position, setPosition] = useState<EpubPosition>({
    percent: 0,
    page: 0,
    totalPages: 0,
    chapter: '',
  });
  const [bookRtl, setBookRtl] = useState(false);
  /** What the book asks for, before the reader overrides it. */
  const [suggestedSpread, setSuggestedSpread] = useState<'auto' | 'none'>('none');
  const [pageAspect, setPageAspect] = useState<number | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  savedRef.current ??= progressFor(path);

  const rtl = settings.direction === 'auto' ? bookRtl : settings.direction === 'rtl';

  const turn = useCallback((delta: 1 | -1) => {
    if (delta === 1) renditionRef.current?.next();
    else renditionRef.current?.prev();
  }, []);

  /**
   * Live values for the listeners running inside the book's iframes. Those are
   * installed once per chapter and outlive the render that created them, so
   * they read through a ref rather than closing over a value that was correct
   * at the time and is not any more.
   */
  const inputRef = useRef<EpubInputHandlers>({
    turn,
    resizeText: () => undefined,
    isRtl: () => false,
  });
  const resizeTextRef = useRef<(delta: 1 | -1) => void>(() => undefined);
  /**
   * The content hook is registered once and runs for every chapter thereafter,
   * long after the render that created it. Reading settings through a ref is
   * what keeps a chapter rendered an hour from now styled the way the reader
   * has since asked for, rather than the way they were when the book opened.
   */
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  inputRef.current = {
    turn,
    resizeText: delta => resizeTextRef.current(delta),
    isRtl: () => rtl,
    ...(onTapCentre ? { onTapCentre } : {}),
  };

  useEffect(() => {
    let cancelled = false;
    const locationsReady = { current: false };
    const cleanups: Array<() => void> = [];

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

        const book = ePub(bytes) as unknown as Book;
        bookRef.current = book;

        // `ePub()` returns before it has read the package document, so the
        // spine, the layout and the reading direction are all still undefined
        // for a moment. Analysing the book in that moment reports every book as
        // a reflowable left-to-right one — which, for a Japanese comic, turns
        // the pages the wrong way and never scales them to the frame.
        await book.ready;
        if (cancelled) return;

        if (book.spine) patchSpineLookup(book.spine as SpineLike);

        const layout = analyseLayout(book);
        const spineItems: SpineItemLike[] = book.spine?.spineItems ?? book.spine?.items ?? [];

        // A novel with a fixed-layout cover reflows as one book rather than
        // switching layout engine at the plates. Done before the rendition is
        // built, because the manager reads these properties as it lays each
        // section out.
        if (!layout.globallyFixed) flattenMixedLayout(spineItems);

        setBookRtl(layout.rtl);
        setSuggestedSpread(resolveSpread(book, layout.globallyFixed));
        setPageAspect(layout.globallyFixed ? pageAspectOf(book) : null);

        const rendition = book.renderTo(container.current!, {
          width: '100%',
          height: '100%',
          // Paginated, not scrolled: a book is a stack of pages, and the
          // progress, page numbers and turn gestures all assume there is such a
          // thing as a page. Scrolled flow has none of that.
          flow: 'paginated',
          spread: settings.spread === 'auto' ? 'auto' : 'none',
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;

        // One section is one page in a comic, so that is what a turn moves by.
        if (layout.globallyFixed) turnBySpine(rendition, spineItems);

        rendition.hooks.content.register(contents => {
          const document = contents.document;
          if (!document) return;
          try {
            unwrapOpsSwitch(document);
            unstretchSvg(document);

            // A pre-paginated book is left entirely alone: epub.js sizes each
            // page to its declared dimensions and scales the frame to fit, and
            // any cap placed on the artwork inside only shrinks it within a
            // page that was already the right size. A fixed page inside an
            // otherwise reflowable book gets the opposite treatment — nothing
            // is scaling it, so it is released from its declared size and
            // styled to flow like the chapters around it.
            if (layout.globallyFixed) {
              // Learned from the first page to arrive; every page of a fixed
              // book is the same shape, so it is only worth asking once.
              setPageAspect(current => current ?? pageAspectFromDocument(document));
            } else {
              relaxFixedPage(document);
              styleImages(document);
            }
            const direction = settingsRef.current.direction;
            applyDirection(document, direction === 'auto' ? null : direction);
            cleanups.push(installInputBridge(document, {
              turn: delta => inputRef.current.turn(delta),
              resizeText: delta => inputRef.current.resizeText(delta),
              isRtl: () => inputRef.current.isRtl(),
              onTapCentre: () => inputRef.current.onTapCentre?.(),
            }));
          } catch {
            // A malformed chapter must not take the whole book down: it still
            // renders, it just misses the polish.
          }
        });

        const saved = savedRef.current;
        const from = saved?.kind === 'locator' && typeof saved.at === 'string' ? saved.at : undefined;
        await rendition.display(from);
        if (cancelled) return;

        if (layout.rtl) unstickRightToLeft(rendition);

        markOpened(path);
        setPosition(current => ({ ...current, percent: saved?.percent ?? 0 }));

        const navigation = await book.loaded.navigation;
        const entries = cancelled ? [] : flattenToc(navigation.toc);
        if (!cancelled) setToc(entries);

        rendition.on('relocated', (event: RelocatedEvent) => {
          const cfi = event.start?.cfi;
          if (!cfi) return;


          const spine = spineItems;
          const chapter = chapterLabelFor(entries, event.start?.href, event.start?.index, spine);

          // A comic is counted in pages of the spine, a novel in generated
          // locations. Counting a comic the novel's way gives a total of
          // almost nothing — and a progress of nothing — because its pages are
          // pictures and locations are measured in characters of text.
          const page = layout.globallyFixed
            ? (event.start?.index ?? 0) + 1
            : event.start?.location != null
              ? event.start.location + 1
              : 0;

          const percent = layout.globallyFixed
            ? Math.round((page / Math.max(1, spine.length)) * 100)
            : locationsReady.current
              ? Math.round(book.locations.percentageFromCfi(cfi) * 100)
              : approximateFromSpine(event, book);

          setPosition(current => ({
            percent: clampPercent(percent),
            page,
            totalPages: layout.globallyFixed
              ? spine.length
              : locationsReady.current
                ? book.locations.length()
                : current.totalPages,
            chapter,
          }));

          saveProgress(path, {
            kind: 'locator',
            at: cfi,
            percent: clampPercent(percent),
            savedAt: Date.now(),
          });
        });

        setStatus('ready');

        // Generated after the book is on screen: it walks the whole text, and
        // nobody should wait on a progress bar to start reading.
        void book.locations
          .generate(LOCATION_CHARS)
          .then(() => {
            if (cancelled) return;
            locationsReady.current = true;
            setPosition(current => ({ ...current, totalPages: book.locations.length() }));
            // Ask for the position again: the one already on screen was
            // reported before there were any locations to number it against,
            // so without this the page count stays blank until the reader
            // happens to turn a page.
            rendition.reportLocation();
          })
          .catch(() => undefined);
      } catch (caught) {
        if (cancelled) return;
        setErrorMessage(caught instanceof Error ? caught.message : 'This book could not be parsed');
        setStatus('error');
      }
    }

    void open();

    return () => {
      cancelled = true;
      for (const cleanup of cleanups) cleanup();
      renditionRef.current?.destroy();
      renditionRef.current = null;
      bookRef.current?.destroy();
      bookRef.current = null;
    };
    // Settings are applied by the effects below; changing one must not reopen
    // the book and lose the reader's place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, markOpened, path, saveProgress]);

  // Theme, font and spacing. Registered under one name and re-registered in
  // place, which epub.js picks up on the next repaint.
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || status !== 'ready') return;
    rendition.themes.register(EPUB_THEME_NAME, epubThemeRules(settings));
    rendition.themes.select(EPUB_THEME_NAME);
    rendition.themes.fontSize(`${settings.fontSizePercent}%`);
  }, [settings, status]);

  useEffect(() => {
    if (status === 'ready') renditionRef.current?.spread(settings.spread);
  }, [settings.spread, status]);

  /**
   * Jumping is two steps, not one: epub.js reports the new location as soon as
   * `display` resolves, and for a section it had not loaded that report carries a
   * correct CFI with a location index of zero. Asking again once the view has
   * settled is what keeps the page readout honest after a jump.
   */
  const displayAndReport = useCallback((target: string) => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    void rendition.display(target).then(() => rendition.reportLocation());
  }, []);

  const goTo = useCallback((href: string) => displayAndReport(href), [displayAndReport]);

  const goToPage = useCallback(
    (page: number) => {
      const cfi = bookRef.current?.locations.cfiFromLocation?.(Math.max(0, page - 1));
      if (cfi) displayAndReport(cfi);
    },
    [displayAndReport],
  );

  const search = useEpubSearch(bookRef, renditionRef);

  return {
    toc,
    position,
    search,
    rtl,
    suggestedSpread,
    pageAspect,
    status,
    errorMessage,
    goTo,
    goToPage,
    turn,
    /** Set by the viewer so a ctrl-wheel inside the book resizes its text. */
    resizeTextRef,
  };
}

/**
 * Works around an epub.js bug that makes right-to-left books unturnable.
 *
 * Its paginated `next()` decides between scrolling within the container and
 * loading the next section by comparing against `scrollWidth`. In a
 * right-to-left book, on a browser whose RTL scroll offsets are negative —
 * which is every current one — that comparison is against the container's full
 * width rather than its scrollable extent. A container that does not overflow,
 * which is the normal case for a page-at-a-time comic, therefore always looks
 * scrollable, and the book scrolls one page-width into empty space instead of
 * turning. Forward navigation simply stops working; backward navigation, whose
 * comparison happens to be sound, keeps working, which is what makes the bug
 * look like a rendering problem rather than a navigation one.
 *
 * Declaring the other scroll convention makes both directions take the
 * load-the-next-section path, which is the correct one here: every page of a
 * pre-paginated book is its own section, so there is never anything to scroll
 * to within the container.
 *
 * The manager overwrites this during `render()` with the result of its own
 * browser probe, so it can only be set once a rendition has been displayed.
 */
function unstickRightToLeft(rendition: Rendition): void {
  rendition.settings.rtlScrollType = 'default';
  if (rendition.manager) rendition.manager.settings.rtlScrollType = 'default';
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function approximateFromSpine(event: RelocatedEvent, book: Book): number {
  const total = book.spine?.spineItems?.length ?? book.spine?.items?.length ?? 0;
  const index = event.start?.index ?? 0;
  if (total <= 0) return 0;
  return Math.round(((index + 1) / total) * 100);
}
