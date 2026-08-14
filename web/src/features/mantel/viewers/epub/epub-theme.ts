import { themeRules, type EpubTheme } from './epub-content';
import type { EpubSettings } from './useEpubBook';

/**
 * Dressing a book in Hearth's clothes.
 *
 * A chapter is rendered inside its own iframe with its own document, which knows
 * nothing of this application's stylesheet — so the palette has to be resolved to
 * literal colours here and handed over as plain rules.
 */

export const EPUB_THEME_NAME = 'hearth';

/** The rules epub.js registers as a named theme, for the settings in force. */
export function epubThemeRules(settings: EpubSettings) {
  return themeRules(readTheme(settings));
}

function readTheme(settings: EpubSettings): EpubTheme {
  const palette = resolvePalette();
  return {
    text: palette.text,
    background: palette.background,
    link: palette.link,
    fontFamily: settings.fontFamily,
    fontSizePercent: settings.fontSizePercent,
    lineHeight: settings.lineHeight,
  };
}

/**
 * The app's own colours, as literal `rgb()` values a book's iframe can use.
 *
 * Reading the custom properties directly does not work twice over: their
 * declared values are themselves `var()` references into the palette, and those
 * references mean nothing inside the book's document, which has no access to
 * Hearth's stylesheet. Letting a throwaway element resolve them here yields a
 * plain colour that travels.
 */
function resolvePalette(): { text: string; background: string; link: string } {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);

  const resolve = (token: string, fallback: string) => {
    probe.style.color = `var(${token}, ${fallback})`;
    return getComputedStyle(probe).color || fallback;
  };

  try {
    return {
      text: resolve('--text-primary', '#1c1917'),
      background: resolve('--surface-base', '#ffffff'),
      link: resolve('--accent', '#d2570f'),
    };
  } finally {
    probe.remove();
  }
}
