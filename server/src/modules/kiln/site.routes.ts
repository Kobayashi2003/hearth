import path from 'node:path';

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { FileEntry, HtmlPreview } from '@hearth/shared';

import type { RuntimeState } from '../../config/runtime-state.js';
import type { FfmpegAdapter } from '../../adapters/ffmpeg/ffmpeg.js';
import { HearthError } from '../../lib/errors.js';
import { abortSignalOf } from '../../lib/request.js';
import type { SafePath } from '../../lib/vault.js';
import type { ListingService } from '../vault/listing.service.js';
import { siteSandboxed, type DocumentService } from './document.service.js';
import { openFile, pathQuery, READ } from './route-helpers.js';
import type { StreamService } from './stream.service.js';

export interface SiteRouteServices {
  listing: ListingService;
  streams: StreamService;
  documents: DocumentService;
  ffmpeg: FfmpegAdapter;
}

const PAGE = /\.(html?|xhtml)$/i;
/** Ruffle's files, under the site's own URL so its .wasm loads from where the page is allowed to fetch. */
const RUFFLE_PREFIX = '__ruffle/';

/**
 * Whether the browser plays a file as it is, by path, mtime and size: a
 * <video> asks for the same file several times (metadata, then ranges), and
 * ffprobe is a process each time.
 */
const playable = new Map<string, boolean>();
const PLAYABLE_MEMO = 500;

/**
 * What a page served as a site may do. Fetches stay on this server unless an
 * administrator lets external resources in. When anything runs (the page's own
 * scripts, or Ruffle), `sandbox` without allow-same-origin gives the page an
 * opaque origin even when opened in a tab of its own: it cannot read Hearth's
 * cookies or storage, and its requests to Hearth carry no session.
 */
function sitePolicy(runtime: RuntimeState): string {
  const scripts = siteSandboxed(runtime);
  const web = runtime.get('htmlExternalResources') ? ' http: https:' : '';
  return [
    // Nothing runs in a sanitised page, so it needs no sandbox, and without one
    // its frames can navigate one another as the site was written.
    ...(scripts ? ['sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox'] : []),
    "default-src 'none'",
    `img-src 'self' data: blob:${web}`,
    `media-src 'self' data: blob:${web}`,
    `style-src 'self' 'unsafe-inline'${web}`,
    `font-src 'self' data:${web}`,
    "frame-src 'self'",
    ...(scripts
      ? [
          `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:${web}`,
          `connect-src 'self' data: blob:${web}`,
          "worker-src 'self' blob:",
        ]
      : []),
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
}

/**
 * `rest` (the URL past the token) as a path in the root, or a refusal when it
 * leaves the token's folder. Windows reads a backslash as a separator too;
 * checked as written, `..\..` would pass for a name inside the folder and then
 * resolve outside it.
 */
function inFolder(folder: string, rest: string): string {
  const relative = path.posix.normalize(path.posix.join(folder, rest.replace(/\\/g, '/')));
  const inside =
    folder === '.' || folder === ''
      ? relative !== '..' && !relative.startsWith('../')
      : relative === folder || relative.startsWith(`${folder}/`);
  if (!inside) throw HearthError.forbidden('That file is outside the page’s folder');
  return relative;
}

/**
 * Pages served with their folder: `/html-proxy` says how to show an .html
 * file, and `/site/:token/*` serves a folder's pages and files. The token in
 * the path is the credential: a sandboxed page has no session cookie to send,
 * and keeping the token in the path lets the page's relative URLs resolve
 * beneath it unchanged.
 */
export function createSiteRoutes(services: SiteRouteServices): FastifyPluginAsync {
  return async app => {
    await app.register(htmlProxyRoute(services));
    await app.register(siteRoute(services));
  };
}

/** How to show an .html file: on its own, or as a page of a site served from its folder. */
function htmlProxyRoute({ listing, documents }: SiteRouteServices): FastifyPluginAsync {
  return async app => {
    const { runtime, warden, vault } = app.hearth;

    app.get<{ Querystring: { path: string } }>(
      '/html-proxy',
      { schema: { querystring: pathQuery() }, config: READ },
      async request => {
        const { target } = await openFile(listing, request, request.query.path);
        if (!runtime.get('htmlLocalResources')) {
          const body: HtmlPreview = { mode: 'document', ...(await documents.renderHtml(target)) };
          return body;
        }
        const relative = vault.relativize(target);
        const token = warden.issueSiteToken(
          request.session!.username,
          path.posix.dirname(relative),
        );
        const body: HtmlPreview = {
          mode: 'site',
          url: `/site/${token}/${encodeURIComponent(path.posix.basename(relative))}`,
          sandboxed: siteSandboxed(runtime),
        };
        return body;
      },
    );
  };
}

function siteRoute({ listing, streams, documents, ffmpeg }: SiteRouteServices): FastifyPluginAsync {
  return async app => {
    const { runtime, warden, vault, config } = app.hearth;

    app.get<{ Params: { token: string; '*': string }; Querystring: { hearth?: string } }>(
      '/site/:token/*',
      { config: { auth: 'public', framable: true } },
      async (request, reply) => {
        if (!runtime.get('htmlViewerEnabled') || !runtime.get('htmlLocalResources')) {
          throw HearthError.forbidden('Opening HTML pages with their local files is turned off');
        }
        const scope = warden.verifySiteToken(request.params.token);
        if (!scope) throw HearthError.unauthorized('This page link has expired; open it again');

        const rest = request.params['*'];
        reply
          .header('Content-Security-Policy', sitePolicy(runtime))
          // Ruffle fetches the movie and its own .wasm from an opaque origin.
          .header('Access-Control-Allow-Origin', '*')
          .header('Referrer-Policy', 'no-referrer');
        if (rest.startsWith(RUFFLE_PREFIX)) return sendRuffle(reply, rest);

        const target = await siteTarget(scope, rest);

        if (PAGE.test(target)) {
          const base = `${config.server.apiPrefix}/site/${request.params.token}/`;
          const page = await documents.renderSitePage(target, `${base}${RUFFLE_PREFIX}`);
          return reply
            .header('Content-Type', 'text/html; charset=utf-8')
            .header('Cache-Control', 'private, no-cache')
            .send(page);
        }
        const file = await listing.assertFile(target);
        if (request.query.hearth === 'video' && runtime.get('htmlVideo')) {
          return sendEmbeddedVideo(request, reply, target, file);
        }
        return streams.send(request, reply, { target, entry: file });
      },
    );

    /**
     * The file the path names inside the token's folder (a folder's index page
     * for a folder), checked with the same folder rules as a signed-in
     * request, for the user the link was made for.
     */
    async function siteTarget(scope: { username: string; folder: string }, rest: string) {
      const session = warden.siteSession(scope.username);
      let target = vault.resolve(inFolder(scope.folder, rest));
      if ((await listing.require(target)).isDirectory) {
        const index = await documents.indexPage(target);
        if (!index) throw HearthError.notFound('This folder has no index page');
        target = index;
      }
      warden.assertCan(session, 'read', vault.relativize(target));
      return target;
    }

    function sendRuffle(reply: FastifyReply, rest: string) {
      if (!runtime.get('htmlRuffle')) throw HearthError.notFound('Ruffle is turned off');
      const file = documents.ruffleFile(rest.slice(RUFFLE_PREFIX.length));
      if (!file) {
        throw HearthError.notFound('Ruffle is not installed; run `pnpm ruffle` on the server');
      }
      return streams.sendGenerated(reply, file);
    }

    /** A <video> standing in for an old plugin's embed (see embedded-video.ts). */
    async function sendEmbeddedVideo(
      request: FastifyRequest,
      reply: FastifyReply,
      target: SafePath,
      file: FileEntry,
    ) {
      const key = `${target}|${file.mtime}|${file.size}`;
      let direct = playable.get(key);
      if (direct === undefined) {
        const probe = await ffmpeg.probe(target, abortSignalOf(request)).catch(() => null);
        direct = probe?.browserPlayable ?? false;
        if (playable.size >= PLAYABLE_MEMO) playable.clear();
        playable.set(key, direct);
      }
      if (!direct) {
        // Not byte-seekable; these clips are short and play through.
        return reply
          .header('Content-Type', 'video/mp4')
          .header('Cache-Control', 'no-store')
          .header('Accept-Ranges', 'none')
          .send(ffmpeg.transcode(target, {}, abortSignalOf(request)));
      }
      // A browser plays H.264 in a QuickTime box, but not when it is labelled as one.
      const entry = /\.(mov|qt)$/i.test(target) ? { ...file, mimeType: 'video/mp4' } : file;
      return streams.send(request, reply, { target, entry });
    }
  };
}
