import {
  BookOpen,
  BookCopy,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  File as FileIcon,
  Film,
  Folder,
  Music,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import {
  ARCHIVE_EXTENSIONS,
  COMIC_BOOK_EXTENSIONS,
  EPUB_EXTENSIONS,
  OFFICE_EXTENSIONS,
  type FileEntry,
} from '@hearth/shared';

import { cn } from '@/lib/cn';

/**
 * Extensions for the classes whose MIME type is normally reliable.
 *
 * Only consulted when there is no MIME type to consult — a member of an archive
 * is a name and a size and nothing else, and a folder of photographs inside a zip
 * should not come out as a wall of blank pages.
 */
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif', '.svg', '.tif', '.tiff', '.ico']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.wma']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.wmv', '.flv', '.m4v', '.ts']);
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.log', '.csv', '.nfo', '.rtf']);

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.py', '.rs', '.go', '.java', '.c', '.cpp', '.cs',
  '.rb', '.php', '.sh', '.ps1', '.sql', '.yml', '.yaml', '.toml', '.html', '.css',
]);

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index).toLowerCase();
}

/**
 * The icon for a file. A comic and a plain zip are the same MIME type but read
 * as different things, so extension decides where the two disagree.
 */
export function FileGlyph({
  entry,
  className,
  style,
}: {
  /** Only the three fields the icon depends on, so a listing is not required. */
  entry: GlyphSubject;
  className?: string;
  style?: React.CSSProperties;
}) {
  const size = cn('h-4 w-4', className);
  const common = { className: size, style };

  if (entry.isDirectory) return <Folder {...common} className={cn(size, 'text-accent')} />;

  const extension = extensionOf(entry.name);
  // A `.cbz` is a book; a `.zip` is an archive that may or may not hold one, and
  // opens as an archive. The icon has to agree with what a double-click does.
  if (COMIC_BOOK_EXTENSIONS.has(extension) || EPUB_EXTENSIONS.has(extension)) {
    return <BookOpen {...common} />;
  }
  if (OFFICE_EXTENSIONS.has(extension)) return <FileSpreadsheet {...common} />;
  if (ARCHIVE_EXTENSIONS.has(extension)) return <FileArchive {...common} />;
  if (CODE_EXTENSIONS.has(extension)) return <FileCode {...common} />;

  if (entry.mimeType.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) {
    return <FileImage {...common} />;
  }
  if (entry.mimeType.startsWith('audio/') || AUDIO_EXTENSIONS.has(extension)) {
    return <FileAudio {...common} />;
  }
  if (entry.mimeType.startsWith('video/') || VIDEO_EXTENSIONS.has(extension)) {
    return <FileVideo {...common} />;
  }
  if (entry.mimeType.startsWith('text/') || TEXT_EXTENSIONS.has(extension)) {
    return <FileText {...common} />;
  }

  return <FileIcon {...common} />;
}

/** What an icon actually needs to know about a thing. */
export type GlyphSubject = Pick<FileEntry, 'name' | 'mimeType' | 'isDirectory'>;

/**
 * The type mark worn over a cover in the grid, or null when the picture already
 * says what the file is.
 *
 * A wall of square covers makes an album, a film and a novel look alike — they
 * are all just a picture. This is the one thing that tells them apart at a
 * glance, so it exists only for kinds whose cover is *about* something else: a
 * photograph is its own subject and gets no mark.
 */
export function coverBadgeFor(entry: GlyphSubject): LucideIcon | null {
  if (entry.isDirectory) return null;

  const extension = extensionOf(entry.name);
  if (COMIC_BOOK_EXTENSIONS.has(extension)) return BookCopy;
  if (EPUB_EXTENSIONS.has(extension)) return BookOpen;
  // A plain archive can still show a cover — the first picture inside it — and
  // then the badge is the only thing saying it is not simply an image.
  if (ARCHIVE_EXTENSIONS.has(extension)) return FileArchive;
  if (extension === '.pdf') return ScrollText;
  if (OFFICE_EXTENSIONS.has(extension)) return FileSpreadsheet;

  if (entry.mimeType.startsWith('video/')) return Film;
  if (entry.mimeType.startsWith('audio/')) return Music;
  return null;
}
