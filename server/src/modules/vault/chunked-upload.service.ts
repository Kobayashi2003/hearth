import crypto from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import type { Logger } from 'pino';
import type { ChunkedUploadSession } from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import type { RuntimeState } from '../../config/runtime-state.js';
import { HearthError } from '../../lib/errors.js';
import { JsonDocument } from '../../lib/json-store.js';
import type { SafePath, Vault } from '../../lib/vault.js';
import { splitRelativeName, type StoredUpload, type UploadService } from './upload.service.js';

interface ChunkSession {
  uploadId: string;
  username: string;
  /** Root-relative destination directory. */
  destination: string;
  relativePath: string;
  size: number;
  chunkSize: number;
  totalChunks: number;
  receivedChunks: number[];
  createdAt: number;
}

interface SessionIndex {
  sessions: ChunkSession[];
}

const SWEEP_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Resumable upload: each chunk is its own part file, `complete` concatenates
 * them in order, and `status` reports which chunks already landed.
 */
const MB = 1024 * 1024;

export class ChunkedUploadService {
  private readonly index: JsonDocument<SessionIndex>;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly runtime: RuntimeState,
    private readonly vault: Vault,
    private readonly uploads: UploadService,
    private readonly logger: Logger,
  ) {
    this.index = new JsonDocument<SessionIndex>(
      path.join(config.upload.chunkDirectory, 'sessions.json'),
      () => ({ sessions: [] }),
    );
  }

  get chunkSize(): number {
    return this.config.upload.chunkSizeBytes;
  }

  async begin(
    username: string,
    destination: SafePath,
    relativePath: string,
    size: number,
    requestedChunkSize: number,
  ): Promise<ChunkedUploadSession> {
    if (size > this.runtime.get('maxUploadSizeMB') * MB) {
      throw new HearthError('PAYLOAD_TOO_LARGE', 'That file is larger than the upload limit');
    }
    splitRelativeName(relativePath);

    const chunkSize = requestedChunkSize > 0 ? requestedChunkSize : this.chunkSize;
    const session: ChunkSession = {
      uploadId: crypto.randomBytes(16).toString('hex'),
      username,
      destination: this.vault.relativize(destination),
      relativePath,
      size,
      chunkSize,
      totalChunks: Math.max(1, Math.ceil(size / chunkSize)),
      receivedChunks: [],
      createdAt: Date.now(),
    };

    await fsp.mkdir(this.partsDirectory(session.uploadId), { recursive: true });
    await this.index.update(current => ({ sessions: [...current.sessions, session] }));

    return toPublicSession(session);
  }

  async acceptChunk(
    username: string,
    uploadId: string,
    chunkIndex: number,
    content: Readable,
  ): Promise<ChunkedUploadSession> {
    const session = this.requireSession(username, uploadId);
    if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      throw HearthError.badRequest('Chunk index is outside this upload');
    }

    const partPath = path.join(this.partsDirectory(uploadId), String(chunkIndex));
    await pipeline(content, createWriteStream(partPath));

    const updated = await this.index.update(current => ({
      sessions: current.sessions.map(candidate =>
        candidate.uploadId === uploadId
          ? {
              ...candidate,
              receivedChunks: [...new Set([...candidate.receivedChunks, chunkIndex])].sort(
                (a, b) => a - b,
              ),
            }
          : candidate,
      ),
    }));

    return toPublicSession(updated.sessions.find(s => s.uploadId === uploadId)!);
  }

  status(username: string, uploadId: string): ChunkedUploadSession {
    return toPublicSession(this.requireSession(username, uploadId));
  }

  async complete(username: string, uploadId: string): Promise<StoredUpload> {
    const session = this.requireSession(username, uploadId);
    if (session.receivedChunks.length !== session.totalChunks) {
      const missing = session.totalChunks - session.receivedChunks.length;
      throw HearthError.badRequest(`Upload is incomplete — ${missing} chunk(s) still missing`);
    }

    const destination = this.vault.resolve(session.destination);
    const parts = Array.from({ length: session.totalChunks }, (_, index) =>
      path.join(this.partsDirectory(uploadId), String(index)),
    );

    try {
      return await this.uploads.store(
        destination,
        session.relativePath,
        Readable.from(concatenate(parts)),
      );
    } finally {
      await this.discard(uploadId);
    }
  }

  async abort(username: string, uploadId: string): Promise<void> {
    this.requireSession(username, uploadId);
    await this.discard(uploadId);
  }

  startSweeper(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      void this.sweepExpired().catch(error =>
        this.logger.warn({ err: error }, 'chunk sweep failed'),
      );
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
    void this.sweepExpired().catch(() => undefined);
  }

  stopSweeper(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  private async sweepExpired(): Promise<void> {
    const deadline = Date.now() - this.config.upload.chunkSessionTimeoutMs;
    const expired = this.index.read().sessions.filter(session => session.createdAt < deadline);

    for (const session of expired) await this.discard(session.uploadId);
    if (expired.length > 0) {
      this.logger.info({ removed: expired.length }, 'abandoned chunked uploads cleaned up');
    }
  }

  private async discard(uploadId: string): Promise<void> {
    await fsp.rm(this.partsDirectory(uploadId), { recursive: true, force: true });
    await this.index.update(current => ({
      sessions: current.sessions.filter(session => session.uploadId !== uploadId),
    }));
  }

  private requireSession(username: string, uploadId: string): ChunkSession {
    const session = this.index.read().sessions.find(candidate => candidate.uploadId === uploadId);
    if (!session || session.username !== username) {
      throw HearthError.notFound('No such upload — it may have expired');
    }
    return session;
  }

  private partsDirectory(uploadId: string): string {
    return path.join(this.config.upload.chunkDirectory, uploadId);
  }
}

async function* concatenate(parts: string[]): AsyncGenerator<Buffer> {
  for (const part of parts) {
    for await (const chunk of createReadStream(part)) yield chunk as Buffer;
  }
}

function toPublicSession(session: ChunkSession): ChunkedUploadSession {
  return {
    uploadId: session.uploadId,
    chunkSize: session.chunkSize,
    totalChunks: session.totalChunks,
    receivedChunks: session.receivedChunks,
  };
}
