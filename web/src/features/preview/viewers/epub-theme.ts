import { configureReaderUi } from '@/vendor/epub-reader/react';
import type { ReaderThemeDefinition } from '@/vendor/epub-reader/core';

/** The reader theme that follows Hearth: its own paper and ink, light or dark as Hearth is. */
export const HEARTH_THEME = 'hearth';

/**
 * Hearth's palette (app.css) as the reader takes it: page colours go into the
 * book's frame, where Hearth's CSS variables do not reach, so they are
 * literal; `ui` paints the reader's own panels and bars.
 */
const PALETTES: Record<'light' | 'dark', ReaderThemeDefinition> = {
  light: {
    id: HEARTH_THEME,
    label: 'Hearth',
    preview: 'linear-gradient(135deg, #f8f9f6 50%, #1d2124 50%)',
    foreground: '#23272b',
    background: '#f8f9f6',
    link: '#2f6255',
    colorScheme: 'light',
    ui: {
      reader: '#e2e6e0',
      surface: '#f8f9f6',
      surfaceRaised: '#ffffff',
      surfaceMuted: '#eef0ec',
      text: '#23272b',
      textMuted: '#4c545b',
      line: '#d2d8d1',
      lineStrong: '#b4bdb5',
      accent: '#3e7a6b',
      accentStrong: '#2f6255',
      accentSoft: 'rgb(62 122 107 / 0.12)',
    },
  },
  dark: {
    id: HEARTH_THEME,
    label: 'Hearth',
    preview: 'linear-gradient(135deg, #f8f9f6 50%, #1d2124 50%)',
    foreground: '#e5e9e6',
    background: '#1d2124',
    link: '#9fcdbe',
    colorScheme: 'dark',
    // Dark text a book sets for itself would vanish on this page.
    forceTextColor: true,
    ui: {
      reader: '#111315',
      surface: '#1d2124',
      surfaceRaised: '#252a2e',
      surfaceMuted: '#2d3337',
      text: '#e5e9e6',
      textMuted: '#aab2ae',
      line: '#2d3337',
      lineStrong: '#454d52',
      accent: '#7fb8a6',
      accentStrong: '#9fcdbe',
      accentSoft: 'rgb(127 184 166 / 0.14)',
    },
  },
};

/**
 * One configuration per scheme, made once: the reader reads its themes when a
 * book opens, so following Hearth from light to dark means opening the book
 * again with the other one.
 */
export const READER_CONFIGURATIONS = {
  light: configureReaderUi({ themes: [PALETTES.light] }),
  dark: configureReaderUi({ themes: [PALETTES.dark] }),
};
