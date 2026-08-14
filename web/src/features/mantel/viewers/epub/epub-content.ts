/**
 * The work that has to happen inside each chapter's iframe.
 *
 * epub.js renders every spine item into its own document, which means the app's
 * stylesheet, its event listeners and its theme all stop at the frame boundary.
 * Everything here is injected on the far side of that boundary, once per
 * chapter, as it is rendered.
 */

import { aspectFromViewBox, aspectFromViewport } from './epub-layout';

const IMAGE_STYLE_ID = 'hearth-epub-images';
const FIXED_FIT_STYLE_ID = 'hearth-epub-fixed-fit';
const OPS_NAMESPACE = 'http://www.idpf.org/2007/ops';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';

export interface EpubTheme {
  text: string;
  background: string;
  link: string;
  fontFamily: string | null;
  fontSizePercent: number;
  lineHeight: number;
}

/**
 * Fits pictures to the page.
 *
 * Scanned books are a stack of full-page images whose intrinsic size is
 * whatever the scanner produced; left alone they overflow the column and
 * epub.js paginates the overflow into blank pages.
 */
export function styleImages(document: Document): void {
  if (document.getElementById(IMAGE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = IMAGE_STYLE_ID;
  style.textContent = `
    /* 95vh, not 100: the book's own body margin sits outside the image, so a
       full-height picture overflows the column by exactly that margin and
       epub.js paginates the overflow into a near-empty following page. */
    img { display: block; max-width: 100% !important; max-height: 95vh !important;
          height: auto !important; margin-left: auto !important; margin-right: auto !important;
          object-fit: contain; }
    svg { max-width: 100% !important; max-height: 95vh !important; }
  `;
  document.head?.appendChild(style);
}

/**
 * Unwraps `<ops:switch>`, which EPUB 3 uses to offer MathML with a picture
 * fallback. Browsers render neither branch, so the page comes out empty unless
 * the fallback image is lifted out.
 */
export function unwrapOpsSwitch(document: Document): void {
  const switches = [
    ...document.getElementsByTagName('ops:switch'),
    ...document.getElementsByTagNameNS(OPS_NAMESPACE, 'switch'),
  ];

  for (const node of switches) {
    const source =
      [...node.getElementsByTagName('image')]
        .map(
          image =>
            image.getAttributeNS(XLINK_NAMESPACE, 'href') ??
            image.getAttribute('xlink:href') ??
            image.getAttribute('href'),
        )
        .find(Boolean) ?? [...node.getElementsByTagName('img')].map(img => img.getAttribute('src')).find(Boolean);

    if (!source) continue;
    const replacement = document.createElement('img');
    replacement.setAttribute('src', source);
    replacement.setAttribute('alt', '');
    node.parentNode?.replaceChild(replacement, node);
  }
}

/**
 * Stretched SVG pages, as produced by some conversion tools: a page-sized SVG
 * declaring `preserveAspectRatio="none"` is distorted to whatever shape the
 * viewport happens to be.
 */
export function unstretchSvg(document: Document): void {
  for (const svg of document.querySelectorAll<SVGSVGElement>('svg[preserveAspectRatio="none"]')) {
    if (svg.getAttribute('width') === '100%' && svg.getAttribute('height') === '100%') {
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
  }
}

/**
 * A fixed-layout page inside an otherwise reflowable book.
 *
 * Its `<meta name="viewport">` pins a pixel size that has nothing to do with
 * the window. Dropping it, and the margins that come with it, lets the page
 * scale to the frame like every other.
 */
export function relaxFixedPage(document: Document): void {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport) return;
  viewport.remove();

  if (document.getElementById(FIXED_FIT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = FIXED_FIT_STYLE_ID;
  style.textContent = 'body { margin: 0 !important; padding: 0 !important; }';
  document.head?.appendChild(style);
}

/**
 * The shape of this page, for books that decline to state it in their package
 * document — which, in practice, is most of them: the field exists, and is
 * empty. The page itself always knows, either in its viewport meta or in the
 * viewBox of the SVG its artwork is wrapped in.
 */
export function pageAspectFromDocument(document: Document): number | null {
  const meta = document.querySelector('meta[name="viewport"]')?.getAttribute('content');
  return (
    aspectFromViewport(meta) ??
    aspectFromViewBox(document.querySelector('svg[viewBox]')?.getAttribute('viewBox'))
  );
}

/**
 * Whether this chapter is set in vertical Japanese.
 *
 * It matters because a `dir` attribute applied over vertical writing turns the
 * page inside out — the direction is already carried by `writing-mode`, and
 * setting both leaves epub.js paginating along one axis and the text running
 * along the other.
 */
export function isVerticalWriting(document: Document): boolean {
  const root = document.documentElement;
  if (!root) return false;
  if (root.classList.contains('vrtl') || root.classList.contains('vltr')) return true;
  const view = document.defaultView;
  if (!view) return false;
  return /vertical/.test(view.getComputedStyle(root).writingMode ?? '');
}

export function applyDirection(document: Document, direction: 'ltr' | 'rtl' | null): void {
  const root = document.documentElement;
  if (!root || !document.body) return;

  if (isVerticalWriting(document) || direction === null) {
    root.removeAttribute('dir');
    document.body.removeAttribute('dir');
    return;
  }
  root.setAttribute('dir', direction);
  document.body.setAttribute('dir', direction);
}

/**
 * The theme, as epub.js wants it: a nested object it turns into a stylesheet.
 *
 * `!important` throughout, because a book's own stylesheet is loaded after this
 * one and most of them set a colour on `body`. A dark theme that loses to the
 * book's own white background is worse than no theme at all.
 */
export function themeRules(theme: EpubTheme): Record<string, Record<string, string>> {
  const body: Record<string, string> = {
    color: `${theme.text} !important`,
    background: `${theme.background} !important`,
    'line-height': `${theme.lineHeight} !important`,
  };
  if (theme.fontFamily) body['font-family'] = `${theme.fontFamily} !important`;

  return {
    body,
    'a, a:link, a:visited': { color: `${theme.link} !important` },
    'h1, h2, h3, h4, h5, h6': { color: `${theme.text} !important` },
    // Inherit rather than restate: a book that colours its own emphasis keeps
    // doing so, it just no longer does it against the wrong background.
    'p, span, div, li, td, th, blockquote, figcaption, cite, em, strong': {
      color: 'inherit !important',
    },
  };
}
