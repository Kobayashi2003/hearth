import { useEffect, useState, type RefObject } from 'react';

/** Scrolled this far, the header folds; back above `UNFOLD_AT`, it opens again. */
const FOLD_AT = 48;
const UNFOLD_AT = 8;
/**
 * Folding gives the list more height; with only a little to scroll, that could
 * leave nothing to scroll, open the header again and so on. Below this much
 * room the header stays open.
 */
const MIN_ROOM = 240;

/**
 * Whether the listing has been scrolled down far enough for a compact header
 * to fold to its first row. Opens again at the top, and for each new folder.
 */
export function useScrollFold(scrollRef: RefObject<HTMLElement | null>, resetKey: unknown) {
  const [folded, setFolded] = useState(false);
  const [foldedFor, setFoldedFor] = useState(resetKey);
  if (foldedFor !== resetKey) {
    setFoldedFor(resetKey);
    setFolded(false);
  }

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const onScroll = () => {
      const top = element.scrollTop;
      const room = element.scrollHeight - element.clientHeight;
      setFolded(current => (current ? top > UNFOLD_AT : top > FOLD_AT && room > MIN_ROOM));
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, [scrollRef]);

  return folded;
}
