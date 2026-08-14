import { useCallback, useRef, useState } from 'react';

/**
 * Finding a phrase inside a book.
 *
 * epub.js can only search a section it has loaded, and a book is deliberately not
 * all in memory at once — so a search is a walk: load a section, ask it, throw it
 * away, move on. That is slow enough to need cancelling, which is what the ticket
 * is for: a second search invalidates the first mid-walk rather than letting two
 * of them interleave results into the same list.
 *
 * Matches are highlighted through the annotation API, and the highlights are
 * tracked so they can be taken off again — epub.js has no "remove all".
 */

export interface SearchHit {
  cfi: string;
  excerpt: string;
}

/** Enough to see the phrase in context in a narrow panel, and no more. */
const MAX_HITS = 200;

interface SearchableSection {
  load: (request: unknown) => Promise<unknown>;
  unload: () => void;
  find: (query: string) => Array<{ cfi: string; excerpt?: string }>;
}

export interface SearchableBook {
  load: (url: string) => Promise<unknown>;
  spine?: { spineItems?: SearchableSection[]; items?: SearchableSection[] };
}

export interface AnnotatingRendition {
  display: (target?: string | number) => Promise<void>;
  /**
   * Re-emit the current location.
   *
   * epub.js reports a location as soon as `display` resolves, which for a jump
   * into a section that was not loaded is before the view has settled: the CFI is
   * right but the location index and percentage come back as zero. Asking again
   * afterwards is what makes the page readout follow a search hit instead of
   * sitting at page one until the reader happens to turn a page.
   */
  reportLocation?: () => void;
  annotations: {
    highlight: (
      cfi: string,
      data?: Record<string, unknown>,
      callback?: () => void,
      className?: string,
      styles?: Record<string, string>,
    ) => void;
    remove: (cfi: string, type: string) => void;
  };
}

export function useEpubSearch(
  bookRef: React.RefObject<SearchableBook | null>,
  renditionRef: React.RefObject<AnnotatingRendition | null>,
) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [index, setIndex] = useState(0);
  const [isSearching, setSearching] = useState(false);

  /** Bumped on every new or cancelled search; a stale walk sees the change. */
  const ticket = useRef(0);
  const highlighted = useRef<string[]>([]);

  const clearHighlights = useCallback(() => {
    const rendition = renditionRef.current;
    for (const cfi of highlighted.current) {
      try {
        rendition?.annotations.remove(cfi, 'highlight');
      } catch {
        // The section holding it may have been unloaded already.
      }
    }
    highlighted.current = [];
  }, [renditionRef]);

  const highlight = useCallback(
    (cfi: string) => {
      try {
        renditionRef.current?.annotations.highlight(cfi, {}, undefined, 'hearth-find', {
          fill: 'var(--accent)',
          'fill-opacity': '0.28',
          'mix-blend-mode': 'multiply',
        });
        highlighted.current.push(cfi);
      } catch {
        // Annotations need a rendered view; the jump below still lands.
      }
    },
    [renditionRef],
  );

  /** Land on a hit: show it, mark it, and make the reader's position say so. */
  const jumpTo = useCallback(
    (cfi: string) => {
      const rendition = renditionRef.current;
      if (!rendition) return;
      void rendition.display(cfi).then(() => {
        highlight(cfi);
        rendition.reportLocation?.();
      });
    },
    [highlight, renditionRef],
  );

  const goToHit = useCallback(
    (target: number) => {
      if (hits.length === 0) return;
      const wrapped = ((target % hits.length) + hits.length) % hits.length;
      const hit = hits[wrapped];
      if (!hit) return;

      setIndex(wrapped);
      clearHighlights();
      jumpTo(hit.cfi);
    },
    [clearHighlights, hits, jumpTo],
  );

  const run = useCallback(
    async (term: string) => {
      const book = bookRef.current;
      const trimmed = term.trim();
      const id = ++ticket.current;

      clearHighlights();
      setHits([]);
      setIndex(0);
      if (!book || trimmed.length === 0) return;

      setSearching(true);
      const found: SearchHit[] = [];
      try {
        const sections = book.spine?.spineItems ?? book.spine?.items ?? [];
        for (const section of sections) {
          if (ticket.current !== id) return;
          try {
            await section.load(book.load.bind(book));
            if (ticket.current !== id) {
              section.unload();
              return;
            }
            for (const match of section.find(trimmed)) {
              found.push({ cfi: match.cfi, excerpt: (match.excerpt ?? '').trim() });
            }
          } catch {
            // A section that will not load is skipped rather than fatal: one
            // malformed chapter should not make the whole book unsearchable.
          } finally {
            section.unload();
          }
          if (found.length >= MAX_HITS) break;
        }
      } finally {
        if (ticket.current === id) setSearching(false);
      }

      if (ticket.current !== id) return;
      setHits(found);
      setIndex(0);

      const first = found[0];
      if (first) jumpTo(first.cfi);
    },
    [bookRef, clearHighlights, jumpTo],
  );

  const reset = useCallback(() => {
    ticket.current += 1;
    clearHighlights();
    setQuery('');
    setHits([]);
    setIndex(0);
    setSearching(false);
  }, [clearHighlights]);

  return { query, setQuery, hits, index, isSearching, run, goToHit, reset };
}
