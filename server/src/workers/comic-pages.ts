import path from 'node:path';

/**
 * What counts as a page inside a comic archive, and in what order.
 *
 * Shared by the full extraction worker and the cover worker so the two can
 * never disagree about which entry is page one — a cover that does not match
 * the first page you are shown would be worse than no cover at all.
 */

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif']);

export const RAR_EXTENSIONS = new Set(['.rar', '.cbr']);

/** Natural order, so page 10 follows page 9 rather than page 1. */
export const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function isPage(entryName: string): boolean {
  const base = path.basename(entryName);
  // Skip macOS resource forks, which otherwise appear as duplicate pages.
  if (base.startsWith('.') || entryName.includes('__MACOSX/')) return false;
  return IMAGE_EXTENSIONS.has(path.extname(base).toLowerCase());
}

/**
 * Which entry an EPUB declares as its cover, resolved to a path inside the
 * archive — or null if it declares none.
 *
 * Matched with targeted expressions rather than a parser: these two elements
 * have a fixed shape, and pulling in an XML dependency for four attributes is
 * not worth the weight.
 *
 * Pure, and separated from the archive reading around it, because the resolution
 * rules are where this goes wrong: hrefs are relative to the package file rather
 * than the archive root, and EPUB 2 and 3 declare the cover in different places.
 */
export function coverHrefFrom(
  containerXml: string,
  readEntry: (name: string) => string | null,
): string | null {
  const opfPath = /<rootfile[^>]+full-path="([^"]+)"/i.exec(containerXml)?.[1];
  if (!opfPath) return null;

  const opf = readEntry(opfPath);
  if (!opf) return null;

  // Hrefs inside the package are relative to the package file, not to the root.
  const base = path.posix.dirname(opfPath);
  const resolve = (target: string) =>
    base === '.' ? target : path.posix.normalize(`${base}/${target}`);

  // EPUB 3: the manifest item declares itself as the cover.
  const byProperty = /<item[^>]+properties="[^"]*cover-image[^"]*"[^>]*>/i.exec(opf)?.[0];
  const propertyHref = byProperty ? /href="([^"]+)"/i.exec(byProperty)?.[1] : undefined;
  if (propertyHref) return resolve(decodeURIComponent(propertyHref));

  // EPUB 2: a meta tag names the id of the manifest item that is the cover.
  const coverId = /<meta[^>]+name="cover"[^>]+content="([^"]+)"/i.exec(opf)?.[1];
  if (!coverId) return null;

  const escapedId = coverId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const item = new RegExp(`<item[^>]+id="${escapedId}"[^>]*>`, 'i').exec(opf)?.[0];
  const itemHref = item ? /href="([^"]+)"/i.exec(item)?.[1] : undefined;

  return itemHref ? resolve(decodeURIComponent(itemHref)) : null;
}

/**
 * Width and height from the file header alone — no decoding.
 *
 * Only the three formats that actually appear as comic pages are handled; a
 * fourth would simply be treated as unmeasurable and accepted as-is.
 */
export function imageSize(buffer: Buffer): { width: number; height: number } | null {
  // PNG: IHDR is always the first chunk, at a fixed offset.
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  // JPEG: walk the segment chain to the frame header that carries the size.
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1]!;
      const length = buffer.readUInt16BE(offset + 2);
      // SOF0-SOF15, excluding the four that are not frame headers.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
    return null;
  }

  // WebP: the dimensions sit in the VP8/VP8L/VP8X chunk after the RIFF header.
  if (buffer.length > 30 && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      return {
        width: buffer.readUIntLE(24, 3) + 1,
        height: buffer.readUIntLE(27, 3) + 1,
      };
    }
    if (chunk === 'VP8 ') {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
  }

  return null;
}
