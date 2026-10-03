import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import type { RuntimeState } from '../../server/src/config/runtime-state.js';
import type { SafePath } from '../../server/src/lib/vault.js';
import { DocumentService } from '../../server/src/modules/kiln/document.service.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-html-'));
afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

type Switches = Partial<
  Record<'htmlExternalResources' | 'htmlScripts' | 'htmlRuffle' | 'htmlVideo', boolean>
>;

function service(switches: Switches) {
  const on = switches as Record<string, boolean>;
  const runtime = {
    get: (key: string) => key === 'htmlViewerEnabled' || on[key] === true,
  } as unknown as RuntimeState;
  return new DocumentService(runtime, directory);
}

function page(html: string): SafePath {
  const file = path.join(directory, `page-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(file, html);
  return file as SafePath;
}

const document = (html: string, switches: Switches = {}) =>
  service(switches).renderHtml(page(html));
const site = (html: string, switches: Switches = {}) =>
  service(switches).renderSitePage(page(html), '/api/site/t/__ruffle/');

describe('HTML preview as one document', () => {
  it('blocks protocol-relative and absolute images while external resources are off', async () => {
    const result = await document(
      '<img src="//evil.example/a.png"><img src="https://evil.example/b.png">',
    );
    expect(result.html).not.toContain('evil.example');
    expect(result.blockedResources).toBe(2);
  });

  it('lets web images through, and counts nothing, once an administrator allows them', async () => {
    const result = await document('<img src="https://example.com/b.png">', {
      htmlExternalResources: true,
    });
    expect(result.html).toContain('https://example.com/b.png');
    expect(result.blockedResources).toBe(0);
  });

  it('has nothing beside it on disk: local images and pages are dropped', async () => {
    const { html } = await document('<img src="page_files/a.png"><a href="other.html">c</a>');
    expect(html).toBe('<img /><a>c</a>');
  });

  it('keeps in-page links in the page and sends web links to a new tab', async () => {
    const { html } = await document('<a href="#ch2">a</a><a href="https://example.com/">b</a>');
    expect(html).toContain('<a href="#ch2">a</a>');
    expect(html).toContain('href="https://example.com/" target="_blank" rel="noopener noreferrer"');
  });

  it('keeps the page’s own styles and older presentation, and drops its scripts', async () => {
    const { html } = await document(
      '<style>h1 { color: red }</style><body bgcolor="#000000" text="white"><center>' +
        '<font color="red" size="5" onclick="x()">t</font></center>' +
        '<table border="1"><tr><td bgcolor="#333">x</td></tr></table></body><script>alert(1)</script>',
    );
    expect(html).toContain('<style>h1 { color: red }</style>');
    expect(html).toContain('<body bgcolor="#000000" text="white">');
    expect(html).toContain('<font color="red" size="5">');
    expect(html).toContain('<td bgcolor="#333">');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('alert');
  });
});

describe('HTML preview as a site', () => {
  it('keeps relative URLs, which resolve inside the served folder, and drops the rest', async () => {
    const html = await site(
      '<img src="img/a.jpg"><img src="/rooted.png"><img src="//evil.example/x.png">' +
        '<table background="bg/tile.gif"><tr><td background="https://evil.example/t.gif">x</td></tr></table>',
    );
    expect(html).toContain('<img src="img/a.jpg" />');
    expect(html).toContain('<table background="bg/tile.gif">');
    expect(html).not.toContain('rooted.png');
    expect(html).not.toContain('evil.example');
  });

  it('keeps frames, stylesheets and links to its other pages, frame targets included', async () => {
    const html = await site(
      '<link rel="stylesheet" href="style.css"><frameset cols="200,*">' +
        '<frame src="left.html" name="left"><frame src="right.html" name="right"></frameset>' +
        '<a href="data/page2.htm" target="right">next</a>',
    );
    expect(html).toContain('<link rel="stylesheet" href="style.css" />');
    expect(html).toContain('<frame src="left.html" name="left" />');
    expect(html).toContain('<a href="data/page2.htm" target="right">next</a>');
  });

  it('drops scripts and Flash unless they are allowed', async () => {
    const html = await site('<script>run()</script><embed src="movie/title.swf">');
    expect(html).not.toContain('run()');
    expect(html).not.toContain('embed');
  });

  it('sends the page as written when its scripts may run, behind the frame helper', async () => {
    const raw = '<html><head></head><body><script>run()</script></body></html>';
    const html = await site(raw, { htmlScripts: true });
    expect(html.startsWith('<html><head><script>(function () {')).toBe(true);
    expect(html).toContain('hearth-site-navigate');
    expect(html.endsWith('</head><body><script>run()</script></body></html>')).toBe(true);
  });

  it('points _top and _parent at the viewer when nothing runs and frames navigate freely', async () => {
    const html = await site(
      '<a href="full.html" target="_top">a</a><a href="p.html" target="main">b</a>',
    );
    expect(html).toContain('<a href="full.html" target="hearth-site">a</a>');
    expect(html).toContain('<a href="p.html" target="main">b</a>');
    expect(html).not.toContain('hearth-site-navigate');
  });

  it('loads Ruffle at the top of the page and keeps the Flash for it to take over', async () => {
    const html = await site('<html><head><title>t</title></head><embed src="movie/a.swf"></html>', {
      htmlRuffle: true,
    });
    // A sanitised page has no <head> left, so the helper and the loader lead the page.
    expect(html).toMatch(
      /^<script>\(function \(\) \{.*hearth-site-navigate.*<\/script><script>window\.RufflePlayer=/,
    );
    expect(html).toContain('<script src="/api/site/t/__ruffle/ruffle.js"></script>');
    expect(html).toContain('"publicPath":"/api/site/t/__ruffle/"');
    expect(html).toContain('<embed src="movie/a.swf" />');
  });

  it('plays video embedded for an old plugin in <video> when that is on', async () => {
    const page = '<embed src="movie/a.mov" width="640" height="480" type="video/quicktime">';
    expect(await site(page, { htmlVideo: true })).toContain(
      '<video src="movie/a.mov?hearth=video" width="640" height="480" controls',
    );
    expect(await site(page)).not.toContain('a.mov');
  });
});
