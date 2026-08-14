import { useCallback, useState } from 'react';

/**
 * How text is set for reading, remembered across files.
 *
 * A plain `.txt` novel in 13px monospace running the full width of a 4K monitor
 * is technically the file's contents and practically unreadable. These are the
 * three things that fix that — size, spacing and line length — plus a typeface,
 * since prose and code want opposite ones.
 *
 * Local storage rather than Hob: it is a property of the screen and the distance
 * you are sitting from it.
 */

export type Typeface = 'serif' | 'sans' | 'mono';
export type Measure = 'narrow' | 'wide' | 'full';

export interface ReadingStyle {
  /** Multiplier on the base text size, 1 being the app's own. */
  scale: number;
  lineHeight: number;
  /** How long a line is allowed to get before it wraps. */
  measure: Measure;
  typeface: Typeface;
}

export const SCALES = [0.9, 1, 1.15, 1.3, 1.5, 1.75];
export const LINE_HEIGHTS = [1.4, 1.6, 1.8, 2];

export const MEASURE_CLASS: Record<Measure, string> = {
  // 60–75 characters is the readable range; the widths below bracket it.
  narrow: 'mx-auto max-w-[38rem]',
  wide: 'mx-auto max-w-[60rem]',
  full: '',
};

export const TYPEFACE_CLASS: Record<Typeface, string> = {
  serif: 'font-serif',
  sans: 'font-sans',
  mono: 'font-mono',
};

const STORE_KEY = 'hearth.reading-style';

const DEFAULT_STYLE: ReadingStyle = {
  scale: 1,
  lineHeight: 1.6,
  measure: 'wide',
  typeface: 'sans',
};

function read(): ReadingStyle {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? { ...DEFAULT_STYLE, ...(JSON.parse(raw) as Partial<ReadingStyle>) } : DEFAULT_STYLE;
  } catch {
    return DEFAULT_STYLE;
  }
}

export function useReadingStyle() {
  const [style, setStyle] = useState<ReadingStyle>(read);

  const update = useCallback(<K extends keyof ReadingStyle>(key: K, value: ReadingStyle[K]) => {
    setStyle(current => {
      const next = { ...current, [key]: value };
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(next));
      } catch {
        // The choice still applies to this session.
      }
      return next;
    });
  }, []);

  return { style, update };
}
