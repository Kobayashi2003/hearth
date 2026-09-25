import { useCallback, useState } from 'react';

/** localStorage that never throws (private mode, full quota). */
export const local = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // Losing a per-browser convenience is fine.
    }
  },
};

/** A per-browser remembered choice, e.g. a reader's page layout. */
export function useRemembered<T extends string | number | boolean>(
  key: string,
  fallback: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = local.get(`hearth.${key}`);
    if (stored === null) return fallback;
    try {
      return JSON.parse(stored) as T;
    } catch {
      return fallback;
    }
  });
  const remember = useCallback(
    (next: T) => {
      setValue(next);
      local.set(`hearth.${key}`, JSON.stringify(next));
    },
    [key],
  );
  return [value, remember];
}
