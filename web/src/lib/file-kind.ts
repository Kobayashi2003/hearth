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
  KINDLE_EXTENSIONS,
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

/**
 * Extensions that decide the viewer before the MIME type is looked at, checked
 * in this order: a `.cbz` is a comic by declaration, a `.zip` opens as an
 * archive, and a `.psd` is shown through the server's rendering of it.
 */
const BY_EXTENSION: ReadonlyArray<[ReadonlySet<string>, ViewerKind]> = [
  [COMIC_BOOK_EXTENSIONS, 'comic'],
  [ARCHIVE_EXTENSIONS, 'archive'],
  [EPUB_EXTENSIONS, 'epub'],
  [KINDLE_EXTENSIONS, 'epub'],
  [OFFICE_EXTENSIONS, 'office'],
  [FLASH_EXTENSIONS, 'flash'],
  [PDF_EXTENSIONS, 'pdf'],
  [new Set(['.html', '.htm']), 'html'],
  [new Set(['.psd']), 'image'],
];

const BY_MIME_PREFIX: ReadonlyArray<[string, ViewerKind]> = [
  ['image/', 'image'],
  ['video/', 'video'],
  ['audio/', 'audio'],
  ...TEXT_MIME_PREFIXES.map(prefix => [prefix, 'text'] as [string, ViewerKind]),
];

/** Which viewer opens a file. */
export function viewerKindFor(
  entry: Pick<FileEntry, 'name' | 'mimeType' | 'isDirectory'>,
): ViewerKind {
  if (entry.isDirectory) return 'none';
  const extension = extensionOf(entry.name);
  const byExtension = BY_EXTENSION.find(([extensions]) => extensions.has(extension));
  if (byExtension) return byExtension[1];
  const byMime = BY_MIME_PREFIX.find(([prefix]) => entry.mimeType.startsWith(prefix));
  return byMime ? byMime[1] : 'none';
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

const ICONS: Record<ViewerKind, LucideIcon> = {
  image: Image,
  video: Film,
  audio: Music,
  comic: BookImage,
  epub: BookOpen,
  archive: Archive,
  office: FileText,
  html: Globe,
  flash: Sparkles,
  pdf: FileText,
  text: FileText,
  none: File,
};

/** The kind's icon; a spreadsheet and source code get their own within theirs. */
export function iconFor(entry: Pick<FileEntry, 'name' | 'mimeType' | 'isDirectory'>): LucideIcon {
  if (entry.isDirectory) return Folder;
  const kind = viewerKindFor(entry);
  if (kind === 'office' && /\.xlsx?$/i.test(entry.name)) return FileSpreadsheet;
  if (kind === 'text' && CODE_EXTENSIONS.has(extensionOf(entry.name))) return FileCode2;
  return ICONS[kind];
}
