import {
  Archive,
  BookOpen,
  BookImage,
  File,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Film,
  Folder,
  Globe,
  Image,
  Music,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import {
  ARCHIVE_EXTENSIONS,
  COMIC_BOOK_EXTENSIONS,
  EPUB_EXTENSIONS,
  FLASH_EXTENSIONS,
  OFFICE_EXTENSIONS,
  PDF_EXTENSIONS,
  type FileEntry,
} from '@hearth/shared';

import { extensionOf } from './format';

export type ViewerKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | 'comic'
  | 'archive'
  | 'epub'
  | 'office'
  | 'html'
  | 'pdf'
  | 'flash'
  | 'none';

const TEXT_MIME_PREFIXES = [
  'text/',
  'application/json',
  'application/xml',
  'application/javascript',
];
const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.json',
  '.css',
  '.scss',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.kt',
  '.c',
  '.h',
  '.cpp',
  '.cs',
  '.sh',
  '.ps1',
  '.sql',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.rb',
  '.php',
]);

/** Which viewer opens a file. A `.cbz` is a comic by declaration; a `.zip` opens as an archive. */
export function viewerKindFor(
  entry: Pick<FileEntry, 'name' | 'mimeType' | 'isDirectory'>,
): ViewerKind {
  if (entry.isDirectory) return 'none';
  const extension = extensionOf(entry.name);
  if (COMIC_BOOK_EXTENSIONS.has(extension)) return 'comic';
  if (ARCHIVE_EXTENSIONS.has(extension)) return 'archive';
  if (EPUB_EXTENSIONS.has(extension)) return 'epub';
  if (OFFICE_EXTENSIONS.has(extension)) return 'office';
  if (FLASH_EXTENSIONS.has(extension)) return 'flash';
  if (PDF_EXTENSIONS.has(extension)) return 'pdf';
  if (extension === '.html' || extension === '.htm') return 'html';
  if (extension === '.psd') return 'image';

  const { mimeType } = entry;
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (TEXT_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix))) return 'text';
  return 'none';
}

export function isPreviewable(entry: FileEntry): boolean {
  return viewerKindFor(entry) !== 'none';
}

/** The siblings a preview can step through: same viewer kind, in listing order. */
export function galleryFor(entry: FileEntry, entries: readonly FileEntry[]): FileEntry[] {
  const kind = viewerKindFor(entry);
  if (kind === 'none') return [entry];
  return entries.filter(candidate => viewerKindFor(candidate) === kind);
}

export function iconFor(entry: Pick<FileEntry, 'name' | 'mimeType' | 'isDirectory'>): LucideIcon {
  if (entry.isDirectory) return Folder;
  switch (viewerKindFor(entry)) {
    case 'image':
      return Image;
    case 'video':
      return Film;
    case 'audio':
      return Music;
    case 'comic':
      return BookImage;
    case 'epub':
      return BookOpen;
    case 'archive':
      return Archive;
    case 'office':
      return /\.xlsx?$/i.test(entry.name) ? FileSpreadsheet : FileText;
    case 'html':
      return Globe;
    case 'flash':
      return Sparkles;
    case 'pdf':
      return FileText;
    case 'text':
      return CODE_EXTENSIONS.has(extensionOf(entry.name)) ? FileCode2 : FileText;
    default:
      return File;
  }
}
