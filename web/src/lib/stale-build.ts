/** Within this long of the last reload, a second failure is a real one, not a stale page. */
const RELOAD_WINDOW_MS = 10_000;
const RELOADED_AT = 'hearth.reloadedForBuild';

/**
 * A page left open across a build asks for code by the names of the build it
 * came with, and a build replaces them all, so a viewer opened afterwards
 * fails to load. Reloading picks up the new build. Once only: if loading still
 * fails just after a reload, the file is really missing, and the viewer's own
 * error is shown instead of reloading forever.
 */
export function reloadOnStaleBuild(): void {
  window.addEventListener('vite:preloadError', event => {
    const now = Date.now();
    try {
      const last = Number(sessionStorage.getItem(RELOADED_AT) ?? 0);
      if (now - last < RELOAD_WINDOW_MS) return;
      sessionStorage.setItem(RELOADED_AT, String(now));
    } catch {
      // No session storage: cannot tell a second failure from the first, so do not risk a loop.
      return;
    }
    event.preventDefault();
    window.location.reload();
  });
}
