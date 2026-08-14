import { normaliseHref } from './epub-layout';

/**
 * Makes the spine findable by the hrefs a book actually uses.
 *
 * epub.js looks a section up by exactly the string it was given. The nav
 * document, the spine and the links inside chapters routinely disagree about
 * how to write the same file — `Text/p-001.xhtml` in one, `../Text/p-001.xhtml`
 * in another, bare `p-001.xhtml` in a third — and a lookup that misses returns
 * nothing, so the contents entry silently does nothing when tapped and internal
 * links go nowhere.
 *
 * Falling back to a filename match costs one linear scan on the miss path only,
 * and turns a dead table of contents into a working one.
 */

export interface SpineLike {
  get: (target?: unknown) => unknown;
  items?: Array<{ href?: string }>;
  spineItems?: Array<{ href?: string }>;
}

export function patchSpineLookup(spine: SpineLike): void {
  const original = spine.get.bind(spine);

  spine.get = (target?: unknown) => {
    const found = original(target);
    if (found || typeof target !== 'string') return found ?? original(undefined);

    const wanted = normaliseHref(target);
    const filename = wanted.split('/').pop();
    if (!filename) return original(undefined);

    const items = spine.spineItems ?? spine.items ?? [];
    const match = items.find(item => {
      if (typeof item.href !== 'string') return false;
      const href = normaliseHref(item.href);
      return href === wanted || href === filename || href.endsWith(`/${filename}`);
    });

    return match ?? original(undefined);
  };
}
