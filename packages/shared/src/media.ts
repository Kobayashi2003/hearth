import { COMIC_EXTENSIONS, EPUB_EXTENSIONS } from './constants.js';
import type { FileEntry } from './entities.js';

/**
 * Whether a file can show a picture of itself.
 *
 * One definition, shared by the client deciding whether to request a thumbnail
 * and the server deciding which child stands in for a folder. Two copies of
 * this rule would drift, and the symptom would be a grid full of broken images.
 */
export function hasCoverArt(entry: Pick<FileEntry, 'name' | 'mimeType' | 'isDirectory'>): boolean {
  if (entry.isDirectory) return false;

  const name = entry.name.toLowerCase();
  const extension = name.slice(name.lastIndexOf('.'));

  // Photoshop files are rendered by a worker rather than decoded directly.
  if (extension === '.psd') return true;
  // A book's cover: page one for a comic, the declared image for an EPUB.
  if (COMIC_EXTENSIONS.has(extension) || EPUB_EXTENSIONS.has(extension)) return true;

  return (
    entry.mimeType.startsWith('image/') ||
    entry.mimeType.startsWith('video/') ||
    // Music usually carries its cover in its tags. Where it does not, the
    // request answers 204 and the glyph stands, so asking costs nothing.
    entry.mimeType.startsWith('audio/')
  );
}
