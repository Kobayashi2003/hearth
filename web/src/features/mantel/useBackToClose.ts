import { useEffect, useRef } from 'react';

/**
 * Back closes an open overlay instead of leaving the page.
 *
 * One history entry guards the overlay, pushed with the router's own state
 * fields intact so the hash router does not read it as a navigation. Closing by
 * any other means pops that entry, and a one-shot guard ignores the popstate
 * that pop emits.
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
          ignoreNextPopRef.current = false;
        return;
      }
      if (pushedRef.current) {
        // A real Back press: the entry is already gone, so clear the flag before
        // closing or the effect above pops a second time.
        pushedRef.current = false;
        onCloseRef.current();
      }
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
}
