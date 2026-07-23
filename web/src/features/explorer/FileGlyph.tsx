import {
  BookOpen,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  File as FileIcon,
  Folder,
} from 'lucide-react';
import {
  COMIC_EXTENSIONS,
  EPUB_EXTENSIONS,
  OFFICE_EXTENSIONS,
  type FileEntry,
} from '@hearth/shared';

import { cn } from '@/lib/cn';

const ARCHIVE_EXTENSIONS = new Set(['.zip', '.7z', '.tar', '.gz', '.bz2', '.xz', '.rar']);
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
export function FileGlyph({ entry, className }: { entry: FileEntry; className?: string }) {
  const size = cn('h-4 w-4', className);

  if (entry.isDirectory) return <Folder className={cn(size, 'text-accent')} />;

  const extension = extensionOf(entry.name);
  if (COMIC_EXTENSIONS.has(extension) || EPUB_EXTENSIONS.has(extension)) {
    return <BookOpen className={size} />;
  }
  if (OFFICE_EXTENSIONS.has(extension)) return <FileSpreadsheet className={size} />;
  if (ARCHIVE_EXTENSIONS.has(extension)) return <FileArchive className={size} />;
  if (CODE_EXTENSIONS.has(extension)) return <FileCode className={size} />;

  if (entry.mimeType.startsWith('image/')) return <FileImage className={size} />;
  if (entry.mimeType.startsWith('audio/')) return <FileAudio className={size} />;
  if (entry.mimeType.startsWith('video/')) return <FileVideo className={size} />;
  if (entry.mimeType.startsWith('text/')) return <FileText className={size} />;

  return <FileIcon className={size} />;
}
