import { describe, expect, it } from 'vitest';

import { imageSize } from '../../server/src/workers/comic-pages.js';

/**
 * Header parsing by hand-counted byte offsets. The consequence of getting it
 * wrong is subtle — a wraparound jacket kept as a cover, or a correct cover
 * skipped — so each format is pinned against a synthesised header.
 */

function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(33);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

/** A JPEG with `padding` bytes of segments before the frame header. */
function jpeg(width: number, height: number, padding = 0): Buffer {
  const head = Buffer.from([0xff, 0xd8]);

  const filler = padding
    ? Buffer.concat([
        Buffer.from([0xff, 0xe0]),
        (() => {
          const b = Buffer.alloc(2);
          b.writeUInt16BE(padding + 2, 0);
          return b;
        })(),
        Buffer.alloc(padding),
      ])
    : Buffer.alloc(0);

  const sof = Buffer.alloc(11);
  sof.writeUInt8(0xff, 0);
  sof.writeUInt8(0xc0, 1); // SOF0
  sof.writeUInt16BE(9, 2); // segment length
  sof.writeUInt8(8, 4); // precision
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);

  return Buffer.concat([head, filler, sof, Buffer.alloc(8)]);
}

function webpVp8x(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(40);
  buffer.write('RIFF', 0, 'ascii');
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8X', 12, 'ascii');
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

describe('imageSize', () => {
  it('reads a PNG', () => {
    expect(imageSize(png(1200, 1800))).toEqual({ width: 1200, height: 1800 });
  });

  it('reads a JPEG whose frame header is the first segment', () => {
    expect(imageSize(jpeg(1200, 1800))).toEqual({ width: 1200, height: 1800 });
  });

  it('walks past earlier JPEG segments to reach the frame header', () => {
    // Real photos carry EXIF and JFIF blocks before the size is declared.
    expect(imageSize(jpeg(1600, 2400, 120))).toEqual({ width: 1600, height: 2400 });
  });

  it('reads an extended WebP', () => {
    expect(imageSize(webpVp8x(800, 1200))).toEqual({ width: 800, height: 1200 });
  });

  it('returns null for a format it does not know', () => {
    expect(imageSize(Buffer.from('GIF89a and then some padding bytes here'))).toBeNull();
  });

  it('returns null rather than throwing on a truncated file', () => {
    expect(imageSize(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
    expect(imageSize(Buffer.alloc(0))).toBeNull();
  });
});

describe('imageSize — the decision it drives', () => {
  const isJacket = (buffer: Buffer) => {
    const size = imageSize(buffer);
    return size ? size.width > size.height : false;
  };

  it('flags a wraparound jacket as landscape', () => {
    // Front + spine + back scanned as one sheet.
    expect(isJacket(jpeg(3600, 2400))).toBe(true);
  });

  it('leaves an ordinary portrait cover alone', () => {
    expect(isJacket(jpeg(1200, 1800))).toBe(false);
  });

  it('treats a square page as acceptable rather than a jacket', () => {
    expect(isJacket(png(1500, 1500))).toBe(false);
  });
});
