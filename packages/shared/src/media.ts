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
