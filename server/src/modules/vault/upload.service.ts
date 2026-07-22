import { createWriteStream } from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, PassThrough } from 'node:stream';

import { fileTypeFromBuffer } from 'file-type';
import mimeTypes from 'mime-types';

import type { AppConfig } from '../../config/index.js';
import { fromNodeError, HearthError } from '../../lib/errors.js';
import { mimeForPath } from '../../lib/mime.js';
import { assertValidEntryName, type SafePath, type Vault } from '../../lib/vault.js';
import { resolveCollision } from './fileops.service.js';

/** Enough bytes for `file-type` to recognise every format it supports. */
const MAGIC_NUMBER_SAMPLE_BYTES = 4100;

export interface StoredUpload {
  path: string;
  size: number;
}

export class UploadService {
  constructor(
    private readonly config: AppConfig,
    private readonly vault: Vault,
  ) {}

  /**
   * Write one uploaded stream into `directory`. `relativeName` may contain
   * directory segments — that is how a folder upload preserves its structure —
   * and every segment is validated before it becomes a path.
   */
  async store(
    directory: SafePath,
    relativeName: string,
    content: Readable,
  ): Promise<StoredUpload> {
    const segments = splitRelativeName(relativeName);
    const filename = segments.pop()!;

    // Re-resolving through the vault proves the nested path stays in the root.
    const parent =
      segments.length > 0
        ? this.vault.resolve(path.join(this.vault.relativize(directory), ...segments))
        : directory;

    await fsp.mkdir(parent, { recursive: true });
    const target = await resolveCollision(parent, filename);

    const source = this.config.upload.validateMagicNumber
      ? await this.verifiedStream(content, filename)
      : content;

    let written = 0;
    const counter = new PassThrough();
    counter.on('data', (chunk: Buffer) => {
      written += chunk.length;
      if (written > this.config.upload.maxFileSizeBytes) {
        counter.destroy(
          new HearthError('PAYLOAD_TOO_LARGE', 'That file is larger than the upload limit'),
        );
      }
    });

    try {
      await pipeline(source, counter, createWriteStream(target));
    } catch (error) {
      // A partial file is worse than none — the client will retry.
      await fsp.rm(target, { force: true });
      throw error instanceof HearthError ? error : fromNodeError(error, 'Could not save that file');
    }

    return { path: this.vault.relativize(target as SafePath), size: written };
  }

  /**
   * Reject a file whose actual content contradicts its extension. The leading
   * bytes are buffered, checked, then replayed, so the rest still streams.
   */
  private async verifiedStream(content: Readable, filename: string): Promise<Readable> {
    const chunks: Buffer[] = [];
    let sampled = 0;

    for await (const chunk of content) {
      const buffer = chunk as Buffer;
      chunks.push(buffer);
      sampled += buffer.length;
      if (sampled >= MAGIC_NUMBER_SAMPLE_BYTES) break;
    }

    const sample = Buffer.concat(chunks);
    const detected = await fileTypeFromBuffer(sample);
    assertContentMatchesExtension(filename, detected?.mime);

    // The loop above consumed part of the stream; put it back in front.
    return Readable.from(replay(sample, content));
  }
}

async function* replay(sample: Buffer, rest: Readable): AsyncGenerator<Buffer> {
  yield sample;
  for await (const chunk of rest) yield chunk as Buffer;
}

/**
 * Only a contradiction is an error. `file-type` cannot identify text, source
 * code, or many container formats, and an unrecognised file must not be
 * rejected just because it has no magic number.
 */
function assertContentMatchesExtension(filename: string, detectedMime: string | undefined): void {
  if (!detectedMime) return;

  const claimedMime = mimeForPath(filename);
  if (claimedMime === detectedMime) return;

  // The extension may legitimately map to a different label for the same bytes
  // (e.g. .jpg/.jpeg, or a zip-based format such as .docx or .cbz).
  const detectedExtensions = mimeTypes.extensions[detectedMime] ?? [];
  const claimedExtension = path.extname(filename).slice(1).toLowerCase();
  if (detectedExtensions.includes(claimedExtension)) return;

  const sameFamily = claimedMime.split('/')[0] === detectedMime.split('/')[0];
  if (sameFamily) return;

  throw new HearthError(
    'UNSUPPORTED_MEDIA_TYPE',
    `"${filename}" does not contain the kind of data its extension claims`,
  );
}

/** Normalise a browser-supplied relative path and validate every segment. */
export function splitRelativeName(relativeName: string): string[] {
  const segments = relativeName
    .replace(/\\/g, '/')
    .split('/')
    .filter(segment => segment !== '' && segment !== '.');

  if (segments.length === 0) throw HearthError.badRequest('Missing filename');
  for (const segment of segments) assertValidEntryName(segment);
  return segments;
}
