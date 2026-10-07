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
import { DOCUMENT_SANITIZE_OPTIONS, pageOptions } from './page-sanitizer.js';
import { SITE_NAVIGATION_SCRIPT } from './site-navigation.js';

interface HtmlRender {
  html: string;
  externalResources: boolean;
  /** External images removed because external resources are off. */
  blockedResources: number;
}

/** A site runs in a sandbox whenever anything in it runs: its own scripts, or Ruffle. */
export function siteSandboxed(runtime: RuntimeState): boolean {
  return runtime.get('htmlScripts') || runtime.get('htmlRuffle');
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
