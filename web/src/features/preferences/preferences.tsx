import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_HOB, type HobDocument } from '@hearth/shared';

import { api } from '@/lib/api';
import { local } from '@/lib/storage';

const MIRROR_KEY = 'hearth.preferences';
/** Read by the inline script in index.html before first paint, so dark mode never flashes light. */
const THEME_KEY = 'hearth.theme';

interface PreferencesValue {
  preferences: HobDocument;
  update: <K extends keyof HobDocument>(key: K, value: HobDocument[K]) => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

function readMirror(): HobDocument {
  try {
    return {
      ...DEFAULT_HOB,
      ...(JSON.parse(local.get(MIRROR_KEY) ?? '{}') as Partial<HobDocument>),
    };
  } catch {
    return DEFAULT_HOB;
  }
}

/** Server-owned (Hob) so a choice follows the person across devices; mirrored locally for first paint. */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<HobDocument>(readMirror);

  const accept = useCallback((next: HobDocument) => {
    setPreferences(next);
    local.set(MIRROR_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .preferences()
      .then(server => !cancelled && accept(server))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [accept]);

  const update = useCallback(
    <K extends keyof HobDocument>(key: K, value: HobDocument[K]) => {
      setPreferences(current => {
        const next = { ...current, [key]: value };
        local.set(MIRROR_KEY, JSON.stringify(next));
        return next;
      });
      api.patchPreferences({ [key]: value }).then(accept, () => undefined);
    },
    [accept],
  );

  useEffect(() => {
    document.documentElement.dataset.density = preferences.density;
  }, [preferences.density]);

  useEffect(() => {
    const root = document.documentElement;
    if (preferences.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = preferences.theme;
    local.set(THEME_KEY, preferences.theme === 'system' ? null : preferences.theme);
  }, [preferences.theme]);

  const value = useMemo(() => ({ preferences, update }), [preferences, update]);
  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}

export function usePreferences(): PreferencesValue {
  const value = use(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside PreferencesProvider');
  return value;
}
