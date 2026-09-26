import { COMIC_EXTENSIONS, EPUB_EXTENSIONS } from './constants.js';
import type { FileEntry } from './entities.js';

/**
 * Whether a file can show a picture of itself. Shared so the client asking for
 * a thumbnail and the server choosing a folder's cover can never disagree.
 */
export function hasCoverArt(entry: Pick<FileEntry, 'name' | 'mimeType' | 'isDirectory'>): boolean {
  if (entry.isDirectory) return false;

  const name = entry.name.toLowerCase();
  const extension = name.slice(name.lastIndexOf('.'));
  if (extension === '.psd') return true;
  if (COMIC_EXTENSIONS.has(extension) || EPUB_EXTENSIONS.has(extension)) return true;

  return (
    entry.mimeType.startsWith('image/') ||
    entry.mimeType.startsWith('video/') ||
    entry.mimeType.startsWith('audio/')
  );
}

/** Subtitle codecs that convert to WebVTT. Bitmap ones (PGS, VobSub, DVB) cannot. */
const TEXT_SUBTITLE_CODECS = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text']);

export function isTextSubtitle(codec: string | null): boolean {
  return codec !== null && TEXT_SUBTITLE_CODECS.has(codec);
}

/** In the server's thumbnail cache key and the client's URLs; bump when thumbnails change. */
export const THUMBNAIL_REVISION = 2;
