import { useEffect, useRef } from 'react';

/**
 * Browser Back closes the overlay instead of leaving the folder. An extra
 * history entry is pushed while it is open, carrying the router's own state so
 * the router does not treat it as a navigation.
 */
export function useBackToClose(isOpen: boolean, onClose: () => void): void {
  const pushed = useRef(false);
  const ignoreNextPop = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (isOpen && !pushed.current) {
      window.history.pushState(
        { ...(window.history.state as object | null), hearthOverlay: true },
        '',
      );
      pushed.current = true;
    } else if (!isOpen && pushed.current) {
      pushed.current = false;
      ignoreNextPop.current = true;
      window.history.back();
    }
  }, [isOpen]);

  useEffect(() => {
    function onPopState() {
      if (ignoreNextPop.current) {
        ignoreNextPop.current = false;
        return;
      }
      if (pushed.current) {
        pushed.current = false;
        closeRef.current();
      }
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
}
