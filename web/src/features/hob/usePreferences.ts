import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_HOB, type HobDocument } from '@hearth/shared';

import { api } from '@/lib/api';

/**
 * Hob — how you like things set. Server-owned so a preference chosen on the
 * desktop is in force on the phone, and so two people sharing one browser do
 * not share one appearance.
 *
 * Explorer *state* — path, sort, search — stays in the URL instead, so a view
 * can be linked and the back button works.
 *
 * A local mirror is kept for one reason only: an inline script in `index.html`
 * reads the theme before React exists, which is what stops a dark-theme user
 * seeing a white flash on every load. The mirror is a cache of the server's
 * value, never the source of truth.
 */
export type { Theme, Density, ViewMode } from '@hearth/shared';
export type Preferences = HobDocument;

const MIRROR_KEY = 'hearth.hob.mirror';
const THEME_KEY = 'hearth.theme';

function readMirror(): HobDocument {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    return raw ? { ...DEFAULT_HOB, ...(JSON.parse(raw) as Partial<HobDocument>) } : DEFAULT_HOB;
  } catch {
    return DEFAULT_HOB;
  }
}

function writeMirror(value: HobDocument): void {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(value));
  } catch {
    // A full or disabled storage costs a theme flash, nothing more.
  }
}

export function usePreferences() {
  // Start from the mirror so the first paint is not the default theme, then
  // reconcile with the server. Non-theme preferences may visibly correct once
  // the response lands; theme cannot, because the inline script already applied
  // the mirrored value.
  const [preferences, setPreferences] = useState<HobDocument>(readMirror);

  useEffect(() => {
    let cancelled = false;
    void api
      .preferences()
      .then(server => {
        if (cancelled) return;
        setPreferences(server);
        writeMirror(server);
      })
      .catch(() => {
        // Signed out, or the server is unreachable. The mirror stands in until
        // the session provider resolves the situation.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(<K extends keyof HobDocument>(key: K, value: HobDocument[K]) => {
    // Applied locally first: a density or theme change must not wait on a round
    // trip. The server's echo is authoritative if the two ever disagree.
    setPreferences(current => {
      const next = { ...current, [key]: value };
      writeMirror(next);
      return next;
    });

    void api
      .patchPreferences({ [key]: value } as Partial<HobDocument>)
      .then(server => {
        setPreferences(server);
        writeMirror(server);
      })
      .catch(() => undefined);
  }, []);

  // Density reaches CSS as an attribute so the token interval in theme.css can
  // combine it with `@media (pointer: coarse)` — one preference, two ranges.
  useEffect(() => {
    document.documentElement.dataset.density = preferences.density;
  }, [preferences.density]);

  useEffect(() => {
    const root = document.documentElement;
    if (preferences.theme === 'system') {
      delete root.dataset.theme;
      localStorage.removeItem(THEME_KEY);
    } else {
      root.dataset.theme = preferences.theme;
      // Read by the inline script in index.html, before first paint.
      localStorage.setItem(THEME_KEY, preferences.theme);
    }
  }, [preferences.theme]);

  return { preferences, update };
}
