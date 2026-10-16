import { useMediaQuery } from '@/hooks/useMediaQuery';
import { usePreferences } from './preferences';

/** Light or dark as it is drawn now: the choice, or the system's when the choice is "system". */
export function useResolvedTheme(): 'light' | 'dark' {
  const { preferences } = usePreferences();
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  if (preferences.theme === 'system') return systemDark ? 'dark' : 'light';
  return preferences.theme;
}
