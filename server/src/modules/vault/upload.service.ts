import { createWriteStream } from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, PassThrough } from 'node:stream';

import { fileTypeFromBuffer } from 'file-type';
import mimeTypes from 'mime-types';

import type { AppConfig } from '../../config/index.js';
import type { RuntimeState } from '../../config/runtime-state.js';
import { fromNodeError, HearthError } from '../../lib/errors.js';
import { mimeForPath } from '../../lib/mime.js';
import { assertValidEntryName, type SafePath, type Vault } from '../../lib/vault.js';
import { resolveCollision } from './fileops.service.js';

const MAGIC_NUMBER_SAMPLE_BYTES = 4100;

const MB = 1024 * 1024;

export interface StoredUpload {
  path: string;
  size: number;
}

export class UploadService {
  constructor(
    private readonly config: AppConfig,
    private readonly runtime: RuntimeState,
    private readonly vault: Vault,
  ) {}

  /** `relativeName` may contain directory segments (folder uploads); each is validated. */
  async store(directory: SafePath, relativeName: string, content: Readable): Promise<StoredUpload> {
    const segments = splitRelativeName(relativeName);
    const filename = segments.pop()!;

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
      if (written > this.runtime.get('maxUploadSizeMB') * MB) {
        counter.destroy(
          new HearthError('PAYLOAD_TOO_LARGE', 'That file is larger than the upload limit'),
        );
      }
    });

    try {
      await pipeline(source, counter, createWriteStream(target));
    } catch (error) {
      await fsp.rm(target, { force: true });
      throw error instanceof HearthError ? error : fromNodeError(error, 'Could not save that file');
    }

    return { path: this.vault.relativize(target as SafePath), size: written };
  }

  /** Rejects content that contradicts its extension; the sampled head is replayed so the rest still streams. */
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

    return Readable.from(replay(sample, content));
  }
}

async function* replay(sample: Buffer, rest: Readable): AsyncGenerator<Buffer> {
  yield sample;
  for await (const chunk of rest) yield chunk as Buffer;
}

/** Only a contradiction is an error: unrecognised content (text, code) passes. */
function assertContentMatchesExtension(filename: string, detectedMime: string | undefined): void {
  if (!detectedMime) return;

  const claimedMime = mimeForPath(filename);
  if (claimedMime === detectedMime) return;

  // Same bytes, different label: .jpg/.jpeg, or zip-based formats such as .docx and .cbz.
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

export function splitRelativeName(relativeName: string): string[] {
  const segments = relativeName
    .replace(/\\/g, '/')
    .split('/')
    .filter(segment => segment !== '' && segment !== '.');

  if (segments.length === 0) throw HearthError.badRequest('Missing filename');
  for (const segment of segments) assertValidEntryName(segment);
  return segments;
}
