import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SITE_FRAME_NAME, type HtmlPreview, type SiteNavigateMessage } from '@hearth/shared';

import { api, apiBase } from '@/lib/api';
import { ViewerFrame } from '../ViewerFrame';
import type { ViewerProps } from '../overlay';
import { Loaded } from './simple';

/**
 * A page shown on its own, as a whole document for the frame.
 *
 * Its <style> blocks are kept, and CSS can fetch through `url()`, `@import` or
 * `image-set()` in more spellings than a filter can catch, so the document
 * carries its own CSP: images only from `data:`, plus the web when an
 * administrator allows it, and nothing else at all.
 *
 * A srcdoc document resolves URLs against the parent page, so `#chapter-2`
 * would navigate the frame to Hearth itself; `<base href="about:srcdoc">`
 * keeps such links inside the document. DOMParser documents are inert.
 */
function framed(html: string, externalResources: boolean): string {
  const page = new DOMParser().parseFromString(
    `<!doctype html><html><head></head><body>${html}</body></html>`,
    'text/html',
  );
  const web = externalResources ? ' http: https:' : '';
  const policy = page.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = [
    "default-src 'none'",
    `img-src data:${web}`,
    `style-src 'unsafe-inline'${web}`,
    `font-src data:${web}`,
  ].join('; ');
  const base = page.createElement('base');
  base.href = 'about:srcdoc';
  const charset = page.createElement('meta');
  charset.setAttribute('charset', 'utf-8');
  page.head.prepend(charset, policy, base);

  return `<!doctype html>${page.documentElement.outerHTML}`;
}

const POPUPS = 'allow-popups allow-popups-to-escape-sandbox';

/** A page on its own: sanitised (no scripts) and sandboxed, so it cannot reach Hearth's session. */
function DocumentFrame({
  html,
  external,
  title,
}: {
  html: string;
  external: boolean;
  title: string;
}) {
  const page = useMemo(() => framed(html, external), [html, external]);
  return (
    <iframe title={title} srcDoc={page} sandbox={POPUPS} className="min-h-0 flex-1 bg-white" />
  );
}

/**
 * A page served with its folder, from its URL, under the server's own CSP.
 * When anything runs in it, it is sandboxed (never same-origin) and its links
 * to other frames arrive as messages, since the sandbox will not let a frame
 * navigate its siblings; the frame's name stands for the site's `_top`.
 */
function SiteFrame({ url, sandboxed, title }: { url: string; sandboxed: boolean; title: string }) {
  const start = `${apiBase}${url}`;
  const [src, setSrc] = useState(start);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => setSrc(start), [start]);

  useEffect(() => {
    if (!sandboxed) return;
    const site = new URL(start, window.location.href);
    // The token's segment: a message may only move the frame within this site.
    const token = site.pathname.indexOf('/site/') + '/site/'.length;
    const scope = `${site.origin}${site.pathname.slice(0, site.pathname.indexOf('/', token) + 1)}`;
    function onMessage(event: MessageEvent) {
      const data = event.data as SiteNavigateMessage | undefined;
      if (event.source !== frame.current?.contentWindow || data?.type !== 'hearth-site-navigate')
        return;
      if (typeof data.url === 'string' && data.url.startsWith(scope)) setSrc(data.url);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [start, sandboxed]);

  return (
    <iframe
      ref={frame}
      title={title}
      name={SITE_FRAME_NAME}
      src={src}
      // Old pages start their movies on load and offer full screen.
      allow="autoplay; fullscreen"
      sandbox={sandboxed ? `allow-scripts ${POPUPS}` : undefined}
      className="min-h-0 flex-1 bg-white"
    />
  );
}

function Frame({ preview, title }: { preview: HtmlPreview; title: string }) {
  return preview.mode === 'site' ? (
    <SiteFrame url={preview.url} sandboxed={preview.sandboxed} title={title} />
  ) : (
    <DocumentFrame html={preview.html} external={preview.externalResources} title={title} />
  );
}

export default function HtmlViewer({ entry }: ViewerProps) {
  const query = useQuery({
    queryKey: ['html', entry.path],
    queryFn: () => api.readHtml(entry.path),
    staleTime: Infinity,
    retry: false,
  });

  return (
    <ViewerFrame entry={entry} tone="paper">
      <Loaded query={query} failure="This page could not be opened">
        {data => (
          <div className="absolute inset-0 flex flex-col">
            {data.mode === 'document' && data.blockedResources > 0 ? (
              <p className="border-b border-line bg-sunken px-4 py-1.5 text-[12.5px] text-ink-2">
                {data.blockedResources === 1
                  ? 'An image from another site was blocked.'
                  : `${data.blockedResources} images from other sites were blocked.`}{' '}
                An administrator can allow them in Settings.
              </p>
            ) : null}
            <Frame preview={data} title={entry.name} />
          </div>
        )}
      </Loaded>
    </ViewerFrame>
  );
}
