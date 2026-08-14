import { describe, expect, it } from 'vitest';

import { coverHrefFrom } from '../../server/src/workers/comic-pages.js';

/**
 * EPUB cover resolution. The rules that break: hrefs are relative to the
 * package file rather than the archive root, and EPUB 2 and 3 declare the
 * cover in entirely different places.
 */

const container = (opfPath: string) =>
  `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles><rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/></rootfiles>
  </container>`;

const reader = (files: Record<string, string>) => (name: string) => files[name] ?? null;

describe('coverHrefFrom — EPUB 3', () => {
  it('follows an item that declares itself the cover image', () => {
    const opf = `<package><manifest>
      <item id="a" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
      <item id="c" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>
    </manifest></package>`;

    const href = coverHrefFrom(container('OEBPS/content.opf'), reader({ 'OEBPS/content.opf': opf }));
    expect(href).toBe('OEBPS/images/cover.jpg');
  });

  it('matches when cover-image sits among other properties', () => {
    const opf = `<package><manifest>
      <item id="c" properties="svg cover-image scripted" href="cover.png" media-type="image/png"/>
    </manifest></package>`;

    expect(coverHrefFrom(container('content.opf'), reader({ 'content.opf': opf }))).toBe('cover.png');
  });
});

describe('coverHrefFrom — EPUB 2', () => {
  it('follows the meta tag to the manifest item it names', () => {
    const opf = `<package><metadata><meta name="cover" content="cover-img"/></metadata><manifest>
      <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
      <item id="cover-img" href="images/front.jpeg" media-type="image/jpeg"/>
    </manifest></package>`;

    const href = coverHrefFrom(container('OEBPS/package.opf'), reader({ 'OEBPS/package.opf': opf }));
    expect(href).toBe('OEBPS/images/front.jpeg');
  });

  it('does not confuse a different item that merely mentions cover', () => {
    const opf = `<package><metadata><meta name="cover" content="real-cover"/></metadata><manifest>
      <item id="cover-page" href="text/cover.xhtml" media-type="application/xhtml+xml"/>
      <item id="real-cover" href="images/real.jpg" media-type="image/jpeg"/>
    </manifest></package>`;

    expect(coverHrefFrom(container('package.opf'), reader({ 'package.opf': opf }))).toBe(
      'images/real.jpg',
    );
  });

  it('survives an id containing regex metacharacters', () => {
    const opf = `<package><metadata><meta name="cover" content="cover.id+1"/></metadata><manifest>
      <item id="cover.id+1" href="c.jpg" media-type="image/jpeg"/>
    </manifest></package>`;

    expect(coverHrefFrom(container('package.opf'), reader({ 'package.opf': opf }))).toBe('c.jpg');
  });
});

describe('coverHrefFrom — path resolution', () => {
  it('resolves relative to the package file, not the archive root', () => {
    const opf = `<package><manifest>
      <item id="c" properties="cover-image" href="../art/cover.jpg" media-type="image/jpeg"/>
    </manifest></package>`;

    const href = coverHrefFrom(
      container('EPUB/pkg/content.opf'),
      reader({ 'EPUB/pkg/content.opf': opf }),
    );
    expect(href).toBe('EPUB/art/cover.jpg');
  });

  it('leaves a root-level package href untouched', () => {
    const opf = `<package><manifest>
      <item id="c" properties="cover-image" href="cover.jpg" media-type="image/jpeg"/>
    </manifest></package>`;

    expect(coverHrefFrom(container('content.opf'), reader({ 'content.opf': opf }))).toBe('cover.jpg');
  });

  it('decodes a percent-encoded href', () => {
    const opf = `<package><manifest>
      <item id="c" properties="cover-image" href="images/front%20cover.jpg" media-type="image/jpeg"/>
    </manifest></package>`;

    expect(coverHrefFrom(container('OEBPS/c.opf'), reader({ 'OEBPS/c.opf': opf }))).toBe(
      'OEBPS/images/front cover.jpg',
    );
  });
});

describe('coverHrefFrom — declining to guess', () => {
  it('returns null when the container names no package', () => {
    expect(coverHrefFrom('<container></container>', reader({}))).toBeNull();
  });

  it('returns null when the package file is missing from the archive', () => {
    expect(coverHrefFrom(container('OEBPS/content.opf'), reader({}))).toBeNull();
  });

  it('returns null when no cover is declared, leaving the caller to fall back', () => {
    const opf = `<package><manifest>
      <item id="a" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
    </manifest></package>`;

    expect(coverHrefFrom(container('content.opf'), reader({ 'content.opf': opf }))).toBeNull();
  });

  it('returns null when the meta names an id no item has', () => {
    const opf = `<package><metadata><meta name="cover" content="ghost"/></metadata><manifest>
      <item id="other" href="x.jpg" media-type="image/jpeg"/>
    </manifest></package>`;

    expect(coverHrefFrom(container('content.opf'), reader({ 'content.opf': opf }))).toBeNull();
  });
});
