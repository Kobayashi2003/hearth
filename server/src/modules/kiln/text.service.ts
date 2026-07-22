import fsp from 'node:fs/promises';

import iconv from 'iconv-lite';
import type { TextContentResponse } from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import { fromNodeError, HearthError } from '../../lib/errors.js';
import type { SafePath } from '../../lib/vault.js';

/**
 * Text is read as bytes and decoded explicitly, because a personal file server
 * holds decades-old files: GB18030 Chinese, Shift_JIS Japanese, Windows-1252
 * European text. Guessing UTF-8 for all of them produces mojibake, so the
 * detected encoding is reported and the viewer can override it.
 */
const BYTE_ORDER_MARKS: ReadonlyArray<{ bytes: number[]; encoding: string }> = [
  { bytes: [0xef, 0xbb, 0xbf], encoding: 'utf8' },
  { bytes: [0xff, 0xfe], encoding: 'utf16le' },
  { bytes: [0xfe, 0xff], encoding: 'utf16be' },
];

export class TextService {
  constructor(private readonly config: AppConfig) {}

  async read(target: SafePath, requestedEncoding?: string): Promise<TextContentResponse> {
    const stats = await fsp.stat(target).catch(error => {
      throw fromNodeError(error, 'Could not read that file');
    });

    const limit = this.config.media.maxTextBytes;
    const truncated = stats.size > limit;

    const handle = await fsp.open(target, 'r');
    let buffer: Buffer;
    try {
      const readLength = truncated ? limit : stats.size;
      buffer = Buffer.alloc(readLength);
      await handle.read(buffer, 0, readLength, 0);
    } finally {
      await handle.close();
    }

    const encoding = requestedEncoding ?? detectEncoding(buffer);
    assertSupportedEncoding(encoding);

    return {
      content: iconv.decode(stripByteOrderMark(buffer, encoding), encoding),
      encoding,
      truncated,
      size: stats.size,
    };
  }

  /**
   * Write back in the encoding the file was read in, so editing a GB18030 file
   * does not silently convert it to UTF-8 and break every other tool that opens it.
   */
  async write(target: SafePath, content: string, encoding = 'utf8'): Promise<void> {
    assertSupportedEncoding(encoding);
    try {
      await fsp.writeFile(target, iconv.encode(content, encoding));
    } catch (error) {
      throw fromNodeError(error, 'Could not save that file');
    }
  }
}

function assertSupportedEncoding(encoding: string): void {
  if (!iconv.encodingExists(encoding)) {
    throw HearthError.badRequest(`Unsupported text encoding "${encoding}"`);
  }
}

function stripByteOrderMark(buffer: Buffer, encoding: string): Buffer {
  const mark = BYTE_ORDER_MARKS.find(candidate => candidate.encoding === encoding);
  if (!mark || !startsWith(buffer, mark.bytes)) return buffer;
  return buffer.subarray(mark.bytes.length);
}

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  return bytes.every((byte, index) => buffer[index] === byte);
}

/**
 * A byte-order mark is decisive. Otherwise, valid UTF-8 is assumed — the
 * encoding is self-validating enough that a false positive is rare — and
 * anything else falls back to Windows-1252, which never fails to decode and so
 * always renders something the user can correct.
 */
export function detectEncoding(buffer: Buffer): string {
  for (const mark of BYTE_ORDER_MARKS) {
    if (startsWith(buffer, mark.bytes)) return mark.encoding;
  }
  return isValidUtf8(buffer) ? 'utf8' : 'win1252';
}

function isValidUtf8(buffer: Buffer): boolean {
  // A truncated read can cut a multi-byte sequence in half; ignore a partial
  // sequence at the very end rather than misclassifying the whole file.
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const replacementIndex = decoded.indexOf('�');
  return replacementIndex === -1 || replacementIndex >= decoded.length - 4;
}
