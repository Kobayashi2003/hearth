import { useCallback, useEffect, useState } from 'react';

/**
 * View preferences that belong to the person, not to the URL: theme, density,
 * wallpaper. Explorer *state* — path, sort, search — lives in the URL instead,
 * so a view can be linked and the back button works.
 */
export type Theme = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';
export type ViewMode = 'list' | 'grid';

export interface Preferences {
  theme: Theme;
  density: Density;
  viewMode: ViewMode;
  /** Wallpaper filename, or null for none. */
  wallpaper: string | null;
  wallpaperOpacity: number;
  gridSize: number;
}

const STORAGE_KEY = 'hearth.preferences';
const THEME_KEY = 'hearth.theme';

const DEFAULTS: Preferences = {
  theme: 'system',
  density: 'comfortable',
  viewMode: 'list',
  wallpaper: null,
  wallpaperOpacity: 0.25,
  gridSize: 160,
};

function readStored(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Preferences>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences>(readStored);

  const update = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences(current => {
      const next = { ...current, [key]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

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
