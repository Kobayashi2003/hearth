import fsp from 'node:fs/promises';

import iconv from 'iconv-lite';
import type { TextContentResponse } from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import { decodeText, detectEncoding } from '../../lib/charset.js';
import { fromNodeError, HearthError } from '../../lib/errors.js';
import type { SafePath } from '../../lib/vault.js';

/** Decoded explicitly (GB18030, Shift_JIS… are common); the viewer can override the detected encoding. */
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
      content: decodeText(buffer, encoding),
      encoding,
      truncated,
      size: stats.size,
    };
  }

  /** Written back in the encoding it was read in, so an edit does not silently convert it. */
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

export { detectEncoding };
