import fs from 'node:fs';

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FileEntry } from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import { HearthError } from '../../lib/errors.js';
import { inlineSafetyHeaders, mediaKindOf, mimeForPath } from '../../lib/mime.js';
import type { SafePath } from '../../lib/vault.js';
import { contentRangeHeader, parseRange } from './range.js';

/** Raw byte delivery with Range support. */
export class StreamService {
  constructor(private readonly config: AppConfig) {}

  /** Large buffers keep video ahead of the decoder; small ones keep idle image requests cheap. */
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
    reply.headers(inlineSafetyHeaders(entry.mimeType));
    reply.header('Last-Modified', new Date(entry.mtime).toUTCString());
    reply.header('Cache-Control', 'private, max-age=0, must-revalidate');
    // Inline still names the file: the browser's PDF viewer titles itself from it.
    reply.header(
      'Content-Disposition',
      contentDisposition(
        options.filename ?? entry.name,
        options.download ? 'attachment' : 'inline',
      ),
    );

    const range =
      result.kind === 'satisfiable' ? result.range : { start: 0, end: Math.max(0, size - 1) };
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

    // Otherwise every aborted seek leaks a file descriptor.
    request.raw.on('close', () => stream.destroy());

    return reply.send(stream);
  }

  /** A file Hearth generated or owns (comic page, wallpaper): no Range, cacheable. */
  sendGenerated(reply: FastifyReply, filePath: string, downloadName?: string): FastifyReply {
    if (downloadName) {
      reply.header('Content-Disposition', contentDisposition(downloadName, 'inline'));
    }
    const mimeType = mimeForPath(filePath);
    return reply
      .header('Content-Type', mimeType)
      .headers(inlineSafetyHeaders(mimeType))
      .header('Cache-Control', 'private, max-age=3600')
      .send(fs.createReadStream(filePath));
  }
}

/** RFC 6266 with an ASCII fallback for browsers that ignore `filename*`. */
export function contentDisposition(
  filename: string,
  type: 'attachment' | 'inline' = 'attachment',
): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
