import sanitizeHtml from 'sanitize-html';

import { viewerTarget } from './site-navigation.js';

/**
 * The allow-lists HTML passes through before it is shown: an Office
 * document's rendering, and a saved web page on its own or as part of a site.
 */

/** Everything leaving here is sanitised against an allow-list. */
const DOCUMENT_ALLOWED_TAGS = [
  ...sanitizeHtml.defaults.allowedTags,
  'img',
  'h1',
  'h2',
  'section',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'col',
  'colgroup',
];

/** Presentational inline styles only; `url()` would phone home when the document is opened. */
const DOCUMENT_ALLOWED_STYLES: sanitizeHtml.IOptions['allowedStyles'] = {
  '*': {
    color: [/^[^;{}()]+$/],
    'background-color': [/^[^;{}()]+$/],
    'font-size': [/^[\d.]+(px|pt|em|rem|%)$/],
    'font-weight': [/^(normal|bold|\d{3})$/],
    'font-style': [/^(normal|italic)$/],
    'text-align': [/^(left|right|center|justify)$/],
    'text-decoration': [/^[a-z -]+$/],
    width: [/^[\d.]+(px|pt|em|rem|%)$/],
    height: [/^[\d.]+(px|pt|em|rem|%)$/],
    margin: [/^[\d.a-z %]+$/],
    padding: [/^[\d.a-z %]+$/],
    border: [/^[\d.a-z #%]+$/],
  },
};

export const DOCUMENT_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: DOCUMENT_ALLOWED_TAGS,
  allowedStyles: DOCUMENT_ALLOWED_STYLES,
  // Dropped with their text: a page's <title> is not part of its body.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'title'],
  allowedAttributes: {
    '*': ['style', 'class', 'colspan', 'rowspan', 'id', 'data-sheet'],
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
  },
  allowedSchemes: ['data', 'http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['data'] },
  // `//host/x.png` has no scheme, so the scheme allow-list alone would let it through.
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
};

interface PageContext {
  externalResources: boolean;
  /** Served as a site: relative URLs resolve inside the folder, so they stay as written. */
  site: boolean;
  ruffle: boolean;
  /** Embedded video has been turned into <video>, which the list must then keep. */
  video: boolean;
}

const SCHEME = /^([a-z][a-z\d+.-]*:|\/\/)/i;

/** Old-page presentation, which cannot fetch anything. */
const PRESENTATION_ATTRIBUTES = [
  'align',
  'valign',
  'bgcolor',
  'background',
  'width',
  'height',
  'border',
  'cellpadding',
  'cellspacing',
  'nowrap',
  'title',
  'dir',
  'lang',
];

/** What a page served as a site may keep beyond a single document: its frames, styles and maps. */
const SITE_TAGS = ['frameset', 'frame', 'iframe', 'noframes', 'link', 'map', 'area'];
const SITE_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'name', 'target', 'rel'],
  frameset: ['cols', 'rows', 'border', 'frameborder', 'framespacing'],
  frame: ['src', 'name', 'scrolling', 'noresize', 'frameborder', 'marginwidth', 'marginheight'],
  iframe: ['src', 'name', 'width', 'height', 'scrolling', 'frameborder'],
  link: ['rel', 'href', 'type', 'media'],
  map: ['name'],
  area: ['shape', 'coords', 'href', 'target', 'alt'],
};
/** Kept for Ruffle to find and replace. */
const FLASH_TAGS = ['embed', 'object', 'param'];
const FLASH_ATTRIBUTES: Record<string, string[]> = {
  embed: [
    'src',
    'type',
    'width',
    'height',
    'quality',
    'bgcolor',
    'wmode',
    'flashvars',
    'loop',
    'play',
    'menu',
    'scale',
    'salign',
    'base',
    'allowfullscreen',
  ],
  object: ['data', 'type', 'width', 'height', 'classid', 'codebase', 'name'],
  param: ['name', 'value'],
};

const VIDEO_ATTRIBUTES: Record<string, string[]> = {
  video: ['src', 'width', 'height', 'controls', 'playsinline', 'preload', 'autoplay', 'loop'],
};

/**
 * The allow-list for a page shown on its own. Its <style> blocks stay: what a
 * stylesheet could fetch is refused by the CSP the page is served or framed
 * under, not by this list.
 */
export function pageOptions(context: PageContext, onBlocked: () => void): sanitizeHtml.IOptions {
  const keep = (tagName: string, attribs: sanitizeHtml.Attributes, ...names: string[]) =>
    keepUrls(attribs, names, (raw, name) =>
      allowedUrl(raw, tagName === 'img' || name === 'background', context, onBlocked),
    );
  const link = (tagName: string, attribs: sanitizeHtml.Attributes) => ({
    tagName,
    attribs: linkAttributes(attribs, context),
  });

  return {
    ...DOCUMENT_SANITIZE_OPTIONS,
    allowedTags: pageTags(context),
    nonTextTags: ['script', 'textarea', 'option', 'noscript', 'title'],
    selfClosing: [...sanitizeHtml.defaults.selfClosing, 'frame', 'embed', 'param'],
    // <style> is "vulnerable" only where scripts or fetches are possible; the CSP allows neither.
    allowVulnerableTags: true,
    allowedStyles: undefined,
    allowedAttributes: pageAttributes(context),
    // URLs are judged by `allowedUrl`, which knows local from remote.
    allowedSchemesByTag: {},
    transformTags: {
      a: link,
      area: link,
      link: (tagName, attribs) => ({ tagName, attribs: keep(tagName, attribs, 'href') }),
      '*': (tagName, attribs) => ({
        tagName,
        attribs: keep(tagName, attribs, 'src', 'background', 'data'),
      }),
    },
  };
}

function pageTags({ site, ruffle, video }: PageContext): string[] {
  return [
    ...DOCUMENT_ALLOWED_TAGS,
    'style',
    'body',
    'font',
    'center',
    'big',
    ...(site ? SITE_TAGS : []),
    ...(site && ruffle ? FLASH_TAGS : []),
    ...(site && video ? ['video'] : []),
  ];
}

function pageAttributes({ site, ruffle, video }: PageContext): Record<string, string[]> {
  const base = DOCUMENT_SANITIZE_OPTIONS.allowedAttributes as Record<string, string[]>;
  return {
    ...base,
    '*': [...base['*']!, ...PRESENTATION_ATTRIBUTES],
    // A second <body> merges its attributes into the frame's own.
    body: ['bgcolor', 'text', 'link', 'vlink', 'alink', 'background'],
    font: ['color', 'face', 'size'],
    img: ['src', 'alt', 'width', 'height', 'align', 'border', 'hspace', 'vspace', 'usemap'],
    ...(site ? SITE_ATTRIBUTES : {}),
    ...(site && ruffle ? FLASH_ATTRIBUTES : {}),
    ...(site && video ? VIDEO_ATTRIBUTES : {}),
  };
}

/** Each named URL attribute replaced by what `judge` allows, or removed. */
function keepUrls(
  attribs: sanitizeHtml.Attributes,
  names: string[],
  judge: (raw: string | undefined, name: string) => string | null,
): sanitizeHtml.Attributes {
  const result = { ...attribs };
  for (const name of names) {
    if (!(name in result)) continue;
    const url = judge(result[name], name);
    if (url) result[name] = url;
    else delete result[name];
  }
  return result;
}

/** Where a URL may point, or null to drop it. Inline `data:` only for pictures, never a frame. */
function allowedUrl(
  raw: string | undefined,
  picture: boolean,
  { externalResources, site }: PageContext,
  onBlocked: () => void,
): string | null {
  const url = raw?.trim() ?? '';
  if (!url) return null;
  if (url.startsWith('#') || (picture && /^data:image\//i.test(url))) return url;
  // `//host/x.png` has no scheme but is just as remote.
  if (SCHEME.test(url)) return remoteUrl(url, externalResources, onBlocked);
  // A path from the server root would leave the folder; a relative one stays in it.
  return site && !url.startsWith('/') ? url : null;
}

/** Only web URLs, and only when other sites are allowed; a refused one is counted for the notice. */
function remoteUrl(url: string, externalResources: boolean, onBlocked: () => void): string | null {
  if (externalResources) return /^https?:/i.test(url) ? url : null;
  if (/^(https?:)?\/\//i.test(url)) onBlocked();
  return null;
}

/**
 * Links out open in a new tab with no opener. In-page anchors stay, and in a
 * site so do links to its other pages, aimed at the viewer's frame when they
 * targeted the whole window. Anything else loses its href.
 */
function linkAttributes(
  attribs: sanitizeHtml.Attributes,
  { site, ruffle }: PageContext,
): sanitizeHtml.Attributes {
  const href = attribs.href?.trim() ?? '';
  if (/^(https?:|mailto:)/i.test(href)) {
    return { ...attribs, href, target: '_blank', rel: 'noopener noreferrer' };
  }
  const inSite = site && href !== '' && !SCHEME.test(href) && !href.startsWith('/');
  if (!href.startsWith('#') && !inSite) {
    const { href: _dropped, target: _target, ...rest } = attribs;
    return rest;
  }
  // A sanitised site page is sandboxed only when Ruffle is on; the helper then routes targets.
  if (!site || ruffle) return { ...attribs, href };
  const target = viewerTarget(attribs.target);
  return { ...attribs, href, ...(target ? { target } : {}) };
}
