import path from 'node:path';

import mimeTypes from 'mime-types';
import { EXTENSION_MIME_OVERRIDES, type MediaKind } from '@hearth/shared';

const FALLBACK_MIME = 'application/octet-stream';
const DIRECTORY_MIME = 'inode/directory';

export function mimeForPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return EXTENSION_MIME_OVERRIDES[extension] || mimeTypes.lookup(extension) || FALLBACK_MIME;
}

export { DIRECTORY_MIME };

export function mediaKindOf(mimeType: string): MediaKind | null {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return null;
}

const extensionsByKind = new Map<MediaKind, Set<string>>();

/**
 * Every extension (without the dot) whose MIME type belongs to a media kind.
 * Used to build Everything's `ext:` filter and to classify walk results.
 */
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
