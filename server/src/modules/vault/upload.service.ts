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
import { collisionCandidates, tooManyCollisions } from './fileops.service.js';

const MAGIC_NUMBER_SAMPLE_BYTES = 4100;

const MB = 1024 * 1024;

export interface StoredUpload {
  path: string;
  size: number;
}

/**
 * Refuses (throws) unless the uploader may write `target`. Called for every
 * folder an upload would create and for the file itself, before either is made:
 * a folder upload names its own subfolders, which the request's own path does
 * not cover.
 */
export type MayWrite = (target: SafePath) => void;

export class UploadService {
  constructor(
    private readonly config: AppConfig,
    private readonly runtime: RuntimeState,
    private readonly vault: Vault,
  ) {}

  /** `relativeName` may contain directory segments (folder uploads); each is validated. */
  async store(
    directory: SafePath,
    relativeName: string,
    content: Readable,
    mayWrite: MayWrite,
  ): Promise<StoredUpload> {
    const segments = splitRelativeName(relativeName);
    const filename = segments.pop()!;

    let parent = directory;
    for (const segment of segments) {
      parent = this.vault.resolve(path.join(this.vault.relativize(parent), segment));
      mayWrite(parent);
    }

    const source = this.config.upload.validateMagicNumber
      ? await this.verifiedStream(content, filename)
      : content;

    await fsp.mkdir(parent, { recursive: true });
    const { target, file } = await this.claim(parent, filename, mayWrite);

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
      await pipeline(source, counter, file.createWriteStream());
    } catch (error) {
      // Only this upload's own file: the name was claimed, so no other upload wrote it.
      await fsp.rm(target, { force: true });
      throw error instanceof HearthError ? error : fromNodeError(error, 'Could not save that file');
    }

    return { path: this.vault.relativize(target), size: written };
  }

  /**
   * The first free name, created on the spot so it is this upload's alone: two
   * uploads of one name at once get two files, never one written over the other.
   */
  private async claim(
    parent: SafePath,
    filename: string,
    mayWrite: MayWrite,
  ): Promise<{ target: SafePath; file: fsp.FileHandle }> {
    for (const candidate of collisionCandidates(parent, filename)) {
      const target = this.vault.resolve(this.vault.relativize(candidate));
      mayWrite(target);
      try {
        return { target, file: await fsp.open(target, 'wx') };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw fromNodeError(error, 'Could not save that file');
        }
      }
    }
    throw tooManyCollisions();
  }

  /**
   * Rejects content that contradicts its extension; the sampled head is
   * replayed so the rest still streams. One iterator, stepped by hand: leaving
   * a `for await` early would destroy the stream before the rest is read.
   */
  private async verifiedStream(content: Readable, filename: string): Promise<Readable> {
    const iterator = content[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
    const chunks: Buffer[] = [];
    let sampled = 0;

    while (sampled < MAGIC_NUMBER_SAMPLE_BYTES) {
      const step = await iterator.next();
      if (step.done) break;
      const chunk = Buffer.from(step.value);
      chunks.push(chunk);
      sampled += chunk.length;
    }

    const sample = Buffer.concat(chunks);
    const detected = await fileTypeFromBuffer(sample);
    assertContentMatchesExtension(filename, detected?.mime);

    return Readable.from(replay(sample, iterator));
  }
}

async function* replay(sample: Buffer, rest: AsyncIterator<Buffer>): AsyncGenerator<Buffer> {
  yield sample;
  for (let step = await rest.next(); !step.done; step = await rest.next()) yield step.value;
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
