// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { reloadOnStaleBuild } from '@/lib/stale-build';

const failToLoad = () => {
  const event = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(event);
  return event;
};

describe('a page left open across a build', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('reloads once to pick up the new build, then lets a real failure show', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    reloadOnStaleBuild();

    expect(failToLoad().defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    // Still failing straight after the reload: the file is really gone.
    expect(failToLoad().defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
