import fs from 'node:fs';

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FileEntry } from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import { HearthError } from '../../lib/errors.js';
import { mediaKindOf, mimeForPath } from '../../lib/mime.js';
import type { SafePath } from '../../lib/vault.js';
import { contentRangeHeader, parseRange } from './range.js';

/**
 * Raw byte delivery with Range support. Nothing sits between the file and the
 * socket but this stream — the framework choice exists to keep it that way.
 */
export class StreamService {
  constructor(private readonly config: AppConfig) {}

  /**
   * Buffer size is tuned per media kind: a large one keeps a high-bitrate video
   * ahead of the decoder, a small one avoids holding megabytes per idle image
   * request.
   */
  private bufferSizeFor(mimeType: string): number {
    const { streamBufferBytes } = this.config.storage;
    switch (mediaKindOf(mimeType)) {
      case 'video':
        return streamBufferBytes.video;
      case 'audio':
        return streamBufferBytes.audio;
      default:
        return streamBufferBytes.default;
    }
  }

  async send(
    request: FastifyRequest,
    reply: FastifyReply,
    target: SafePath,
    entry: FileEntry,
    options: { download?: boolean; filename?: string } = {},
  ): Promise<void> {
    const size = entry.size;
    const result = parseRange(request.headers.range, size);

    if (result.kind === 'unsatisfiable') {
      reply.header('Content-Range', `bytes */${size}`);
      throw new HearthError('RANGE_NOT_SATISFIABLE', 'That byte range is not available');
    }

    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Type', entry.mimeType);
    reply.header('Last-Modified', new Date(entry.mtime).toUTCString());
    reply.header('Cache-Control', 'private, max-age=0, must-revalidate');
    if (options.download) {
      reply.header('Content-Disposition', contentDisposition(options.filename ?? entry.name));
    }

    const range = result.kind === 'satisfiable' ? result.range : { start: 0, end: Math.max(0, size - 1) };
    const length = size === 0 ? 0 : range.end - range.start + 1;

    if (result.kind === 'satisfiable') {
      reply.status(206).header('Content-Range', contentRangeHeader(range, size));
    }
    reply.header('Content-Length', length);

    if (request.method === 'HEAD' || length === 0) {
      return reply.send(size === 0 ? '' : undefined);
    }

    const stream = fs.createReadStream(target, {
      start: range.start,
      end: range.end,
      highWaterMark: this.bufferSizeFor(entry.mimeType),
    });

    // Without this, aborting a video seek leaks a file descriptor per seek.
    request.raw.on('close', () => stream.destroy());

    return reply.send(stream);
  }

  /**
   * Serve a file Hearth generated or owns — a cached comic page, a wallpaper —
   * rather than one from the served tree. These need no Range support and are
   * safe to cache hard, so they take a simpler path than `send`.
   */
  sendGenerated(reply: FastifyReply, filePath: string, downloadName?: string): FastifyReply {
    if (downloadName) {
      reply.header('Content-Disposition', contentDisposition(downloadName, 'inline'));
    }
    return reply
      .header('Content-Type', mimeForPath(filePath))
      .header('Cache-Control', 'private, max-age=3600')
      .send(fs.createReadStream(filePath));
  }
}

/**
 * RFC 6266 filename with an ASCII fallback, so CJK and emoji filenames survive
 * browsers that ignore `filename*`.
 */
export function contentDisposition(
  filename: string,
  type: 'attachment' | 'inline' = 'attachment',
): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
