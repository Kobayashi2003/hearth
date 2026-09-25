import path from 'node:path';

import mimeTypes from 'mime-types';
import { EXTENSION_MIME_OVERRIDES, type MediaKind } from '@hearth/shared';

const FALLBACK_MIME = 'application/octet-stream';
export const DIRECTORY_MIME = 'inode/directory';

/** `.ts`/`.mts` are TypeScript and also MPEG transport streams (recordings, AVCHD). */
const AMBIGUOUS_TRANSPORT_STREAM = new Set(['.ts', '.mts']);
/** No TypeScript source is this large; every recording is. */
const TRANSPORT_STREAM_MIN_BYTES = 1024 * 1024;

/** `size`, when known, settles extensions shared by source code and video. */
export function mimeForPath(filePath: string, size?: number): string {
  const extension = path.extname(filePath).toLowerCase();
  if (
    size !== undefined &&
    size >= TRANSPORT_STREAM_MIN_BYTES &&
    AMBIGUOUS_TRANSPORT_STREAM.has(extension) &&
    !filePath.toLowerCase().endsWith('.d.ts')
  ) {
    return 'video/mp2t';
  }
  return EXTENSION_MIME_OVERRIDES[extension] || mimeTypes.lookup(extension) || FALLBACK_MIME;
}

export function mediaKindOf(mimeType: string): MediaKind | null {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return null;
}

const extensionsByKind = new Map<MediaKind, Set<string>>();

/** Extensions (no dot) whose MIME type belongs to a media kind. */
export function extensionsForMediaKind(kind: MediaKind): ReadonlySet<string> {
  const cached = extensionsByKind.get(kind);
  if (cached) return cached;

  const prefix = `${kind}/`;
  const extensions = new Set<string>();

  for (const [extension, mime] of Object.entries(EXTENSION_MIME_OVERRIDES)) {
    if (mime.startsWith(prefix)) extensions.add(extension.slice(1).toLowerCase());
  }
  for (const [extension, mime] of Object.entries(mimeTypes.types)) {
    if (mime.startsWith(prefix)) extensions.add(extension.toLowerCase());
  }

  extensionsByKind.set(kind, extensions);
  return extensions;
}

export function isMediaKind(filePath: string, kind: MediaKind): boolean {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return extension.length > 0 && extensionsForMediaKind(kind).has(extension);
}

/**
 * Headers for serving a user's file inline from Hearth's own origin. Without
 * them an .html or .svg opened directly (or from inside an archive) would run
 * script with the reader's session. `sandbox` gives the document an opaque
 * origin and no scripts; it does not affect <img>, <video> or fetch. PDF is the
 * exception: Chrome will not render one in a sandbox, and it isolates PDF
 * script itself.
 */
export function inlineSafetyHeaders(mimeType: string): Record<string, string> {
  return mimeType === 'application/pdf' ? {} : { 'Content-Security-Policy': 'sandbox' };
}
