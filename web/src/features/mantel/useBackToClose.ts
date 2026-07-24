import { useEffect, useRef } from 'react';

/**
 * Makes the browser Back button close an open overlay instead of navigating the
 * page away — and back again once the overlay is gone.
 *
 * How it works, and the traps it sidesteps (this is easy to get subtly wrong):
 *
 * - When `isOpen` becomes true, one history entry is pushed. It carries the
 *   *same* URL and preserves the router's own `history.state` fields, so the
 *   hash router — which keys off the hash and its state key — does not treat it
 *   as a navigation. Back then pops that entry, and the popstate handler closes
 *   the overlay rather than leaving the page.
 *
 * - When the overlay closes by any *other* means (a button, Escape, the scrim),
 *   the pushed entry has to be removed, so `history.back()` is called. That
 *   itself emits a popstate; a one-shot guard makes the handler ignore that
 *   echo, so it neither closes an already-closed overlay nor pops a second
 *   entry.
 *
 * - Exactly one guard entry ever exists (`pushedRef`). Stepping through a
 *   gallery or swapping which file is previewed keeps `isOpen` true, so entries
 *   never pile up.
 */
export function useBackToClose(isOpen: boolean, onClose: () => void) {
  const pushedRef = useRef(false);
  const ignoreNextPopRef = useRef(false);
  // Read the latest closer from the popstate handler without re-subscribing.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Stop history.back() from scroll-restoring the list underneath the overlay.
  useEffect(() => {
    const previous = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    return () => {
      history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    if (isOpen && !pushedRef.current) {
      // Keep the router's state fields intact so it does not see a navigation.
      const state = { ...(window.history.state as object | null), hearthOverlay: true };
      window.history.pushState(state, '');
      pushedRef.current = true;
    } else if (!isOpen && pushedRef.current) {
      pushedRef.current = false;
      ignoreNextPopRef.current = true;
      window.history.back();
    }
  }, [isOpen]);

  useEffect(() => {
    function onPopState() {
      if (ignoreNextPopRef.current) {
        // The echo from our own history.back() after a manual close.
        ignoreNextPopRef.current = false;
        return;
      }
      if (pushedRef.current) {
        // A real Back press while the overlay is open. The browser has already
        // popped our entry; clear the flag first so the effect above does not
        // then pop a second time.
        pushedRef.current = false;
        onCloseRef.current();
      }
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
}
