import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import sanitizeHtml from 'sanitize-html';
import { OFFICE_EXTENSIONS, type OfficeContentResponse } from '@hearth/shared';

import type { RuntimeState } from '../../config/runtime-state.js';
import { declaredHtmlCharset, decodeText, detectEncoding } from '../../lib/charset.js';
import { HearthError } from '../../lib/errors.js';
import { runWorker } from '../../lib/worker.js';
import type { SafePath } from '../../lib/vault.js';
import type { OfficeRequest, OfficeResponse } from '../../workers/office.worker.js';
import { withPlayableVideos } from './embedded-video.js';
import { SITE_NAVIGATION_SCRIPT, viewerTarget } from './site-navigation.js';

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

const DOCUMENT_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
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

interface HtmlRender {
  html: string;
  externalResources: boolean;
  /** External images removed because external resources are off. */
  blockedResources: number;
}

interface PageContext {
  externalResources: boolean;
  /** Served as a site: relative URLs resolve inside the folder, so they stay as written. */
  site: boolean;
  ruffle: boolean;
  /** Embedded video has been turned into <video>, which the list must then keep. */
  video: boolean;
}

/** A site runs in a sandbox whenever anything in it runs: its own scripts, or Ruffle. */
export function siteSandboxed(runtime: RuntimeState): boolean {
  return runtime.get('htmlScripts') || runtime.get('htmlRuffle');
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
function pageOptions(context: PageContext, onBlocked: () => void): sanitizeHtml.IOptions {
  const { externalResources, site, ruffle, video } = context;

  /** Where a URL may point, or null to drop it. Inline `data:` only for pictures, never a frame. */
  const allowed = (raw: string | undefined, picture: boolean): string | null => {
    const url = raw?.trim() ?? '';
    if (!url) return null;
    if (url.startsWith('#') || (picture && /^data:image\//i.test(url))) return url;
    // `//host/x.png` has no scheme but is just as remote.
    if (SCHEME.test(url)) {
      if (externalResources && /^https?:/i.test(url)) return url;
      if (!externalResources && /^(https?:)?\/\//i.test(url)) onBlocked();
      return null;
    }
    // A path from the server root would leave the folder; a relative one stays in it.
    return site && !url.startsWith('/') ? url : null;
  };
  const keep = (
    tagName: string,
    attribs: sanitizeHtml.Attributes,
    ...names: string[]
  ): sanitizeHtml.Attributes => {
    const result = { ...attribs };
    for (const name of names) {
      if (!(name in result)) continue;
      const url = allowed(result[name], tagName === 'img' || name === 'background');
      if (url) result[name] = url;
      else delete result[name];
    }
    return result;
  };
  const link = (attribs: sanitizeHtml.Attributes): sanitizeHtml.Attributes => {
    const href = attribs.href?.trim() ?? '';
    if (/^(https?:|mailto:)/i.test(href)) {
      return { ...attribs, href, target: '_blank', rel: 'noopener noreferrer' };
    }
    // In-page anchors, and in a site its other pages (with a frame name as target).
    if (href.startsWith('#') || (site && href && !SCHEME.test(href) && !href.startsWith('/'))) {
      // A sanitised site page is sandboxed only when Ruffle is on; the helper then routes targets.
      if (!site || ruffle) return { ...attribs, href };
      const target = viewerTarget(attribs.target);
      return { ...attribs, href, ...(target ? { target } : {}) };
    }
    const { href: _dropped, target: _target, ...rest } = attribs;
    return rest;
  };

  const base = DOCUMENT_SANITIZE_OPTIONS.allowedAttributes as Record<string, string[]>;
  return {
    ...DOCUMENT_SANITIZE_OPTIONS,
    allowedTags: [
      ...DOCUMENT_ALLOWED_TAGS,
      'style',
      'body',
      'font',
      'center',
      'big',
      ...(site ? SITE_TAGS : []),
      ...(site && ruffle ? FLASH_TAGS : []),
      ...(site && video ? ['video'] : []),
    ],
    nonTextTags: ['script', 'textarea', 'option', 'noscript', 'title'],
    selfClosing: [...sanitizeHtml.defaults.selfClosing, 'frame', 'embed', 'param'],
    // <style> is "vulnerable" only where scripts or fetches are possible; the CSP allows neither.
    allowVulnerableTags: true,
    allowedStyles: undefined,
    allowedAttributes: {
      ...base,
      '*': [...base['*']!, ...PRESENTATION_ATTRIBUTES],
      // A second <body> merges its attributes into the frame's own.
      body: ['bgcolor', 'text', 'link', 'vlink', 'alink', 'background'],
      font: ['color', 'face', 'size'],
      img: ['src', 'alt', 'width', 'height', 'align', 'border', 'hspace', 'vspace', 'usemap'],
      ...(site ? SITE_ATTRIBUTES : {}),
      ...(site && ruffle ? FLASH_ATTRIBUTES : {}),
      ...(site && video ? VIDEO_ATTRIBUTES : {}),
    },
    // URLs are judged by `allowed` above, which knows local from remote.
    allowedSchemesByTag: {},
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: link(attribs) }),
      area: (tagName, attribs) => ({ tagName, attribs: link(attribs) }),
      link: (tagName, attribs) => ({ tagName, attribs: keep(tagName, attribs, 'href') }),
      '*': (tagName, attribs) => ({
        tagName,
        attribs: keep(tagName, attribs, 'src', 'background', 'data'),
      }),
    },
  };
}

/** A page's bytes as text: its own <meta charset> first, since old pages are often GBK or Shift_JIS. */
async function readPage(target: SafePath): Promise<string> {
  const bytes = await fsp.readFile(target);
  return decodeText(bytes, declaredHtmlCharset(bytes) ?? detectEncoding(bytes));
}

/** Ruffle takes over every <embed> and <object> holding Flash; `publicPath` is where its .wasm lives. */
function ruffleLoader(ruffleBase: string): string {
  const config = JSON.stringify({
    publicPath: ruffleBase,
    polyfills: true,
    autoplay: 'on',
    unmuteOverlay: 'hidden',
    warnOnUnsupportedContent: false,
    splashScreen: false,
  });
  return (
    `<script>window.RufflePlayer=window.RufflePlayer||{};window.RufflePlayer.config=${config};</script>` +
    `<script src="${ruffleBase}ruffle.js"></script>`
  );
}

/** At the top of <head>, or of the page when it has none, before anything of its own runs. */
function prepend(html: string, snippet: string): string {
  const head = /<head[^>]*>/i.exec(html);
  if (!head) return snippet + html;
  const at = head.index + head[0].length;
  return html.slice(0, at) + snippet + html.slice(at);
}

const INDEX_PAGES = ['index.html', 'index.htm'];

export class DocumentService {
  constructor(
    private readonly runtime: RuntimeState,
    /** The self-hosted Ruffle build. */
    private readonly ruffleDirectory: string,
  ) {}

  /** The page a site folder opens on, if it has one. */
  async indexPage(directory: SafePath): Promise<SafePath | null> {
    for (const name of INDEX_PAGES) {
      const candidate = path.join(directory, name);
      const isFile = await fsp.stat(candidate).then(
        stats => stats.isFile(),
        () => false,
      );
      if (isFile) return candidate as SafePath;
    }
    return null;
  }

  /** One of Ruffle's files, or null when it is not installed (or the name leaves its folder). */
  ruffleFile(name: string): string | null {
    const root = path.resolve(this.ruffleDirectory);
    const file = path.resolve(root, name);
    return file.startsWith(root + path.sep) && fs.existsSync(file) ? file : null;
  }

  async renderOffice(target: SafePath, signal?: AbortSignal): Promise<OfficeContentResponse> {
    if (!OFFICE_EXTENSIONS.has(path.extname(target).toLowerCase())) {
      throw HearthError.badRequest('That file is not an Office document');
    }

    const rendered = await runWorker<OfficeRequest, OfficeResponse>(
      'office',
      { filePath: target },
      signal,
    );

    return {
      html: sanitizeHtml(rendered.html, DOCUMENT_SANITIZE_OPTIONS),
      ...(rendered.sheets ? { sheets: rendered.sheets } : {}),
    };
  }

  /**
   * A page on its own, as one document with nothing beside it on disk: no
   * scripts, no local files, external images only when an administrator
   * allows them (a page fetching remotely reports that it was opened).
   */
  async renderHtml(target: SafePath): Promise<HtmlRender> {
    this.assertEnabled();
    const externalResources = this.runtime.get('htmlExternalResources');
    let blockedResources = 0;
    const options = pageOptions(
      { externalResources, site: false, ruffle: false, video: false },
      () => {
        blockedResources += 1;
      },
    );
    const html = sanitizeHtml(await readPage(target), options);
    return { html, externalResources, blockedResources };
  }

  /**
   * A page of a folder served as a site. With scripts allowed it is sent as
   * written, since sanitising a page whose scripts run protects nothing; the
   * sandbox and CSP it is served under keep it away from Hearth. Otherwise it
   * is sanitised, keeping what a site needs. Video embedded for an old plugin
   * becomes <video> when that is on. A sandboxed page gets the frame
   * navigation helper, and Ruffle (loaded from `ruffleBase`) when it is on.
   */
  async renderSitePage(target: SafePath, ruffleBase: string): Promise<string> {
    this.assertEnabled();
    const ruffle = this.runtime.get('htmlRuffle');
    const video = this.runtime.get('htmlVideo');
    const read = await readPage(target);
    const raw = video ? withPlayableVideos(read) : read;
    const external = this.runtime.get('htmlExternalResources');
    const page = this.runtime.get('htmlScripts')
      ? raw
      : sanitizeHtml(
          raw,
          pageOptions({ externalResources: external, site: true, ruffle, video }, () => {}),
        );
    if (!siteSandboxed(this.runtime)) return page;
    return prepend(page, SITE_NAVIGATION_SCRIPT + (ruffle ? ruffleLoader(ruffleBase) : ''));
  }

  private assertEnabled(): void {
    if (!this.runtime.get('htmlViewerEnabled')) {
      throw HearthError.forbidden('The HTML viewer is disabled');
    }
  }
}
