import type { MediaKind, SortField, SortDirection } from './entities.js';

export const SORT_FIELDS: readonly SortField[] = ['name', 'size', 'mtime', 'type'];
export const SORT_DIRECTIONS: readonly SortDirection[] = ['asc', 'desc'];
export const MEDIA_KINDS: readonly MediaKind[] = ['image', 'audio', 'video'];

/** Windows volume-level entries that are never useful to show. */
export const HIDDEN_SYSTEM_NAMES: ReadonlySet<string> = new Set([
  '$recycle.bin',
  'system volume information',
  'config.msi',
  '$windows.~bt',
  '$windows.~ws',
]);

export function isHiddenSystemEntry(name: string): boolean {
  return HIDDEN_SYSTEM_NAMES.has(name.toLowerCase());
}

/** Applied ahead of the `mime-types` database, which gets these wrong. */
export const EXTENSION_MIME_OVERRIDES: Readonly<Record<string, string>> = {
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.jsx': 'text/javascript',
  '.vue': 'text/x-vue',
  '.svelte': 'text/x-svelte',
  '.cbz': 'application/x-cbz',
  '.cbr': 'application/x-cbr',
  '.opus': 'audio/opus',
  '.flac': 'audio/flac',
  '.sh': 'text/x-shellscript',
  '.bat': 'text/plain',
  '.cmd': 'text/plain',
  '.cfg': 'text/plain',
  '.env': 'text/plain',
  '.log': 'text/plain',
  '.rs': 'text/x-rust',
  '.pl': 'text/x-perl',
  '.py': 'text/x-python',
  '.cs': 'text/x-csharp',
  '.cpp': 'text/x-c++',
  '.ps1': 'text/x-powershell',
  '.go': 'text/x-go',
  '.rb': 'text/x-ruby',
  '.swift': 'text/x-swift',
  '.kt': 'text/x-kotlin',
  '.r': 'text/x-r',
};

/**
 * Archives whose first image can stand as a cover. Wider than
 * `COMIC_BOOK_EXTENSIONS` because plenty of manga arrives as a plain `.zip`.
 */
export const COMIC_EXTENSIONS: ReadonlySet<string> = new Set(['.zip', '.cbz', '.rar', '.cbr']);

/** Archives that declare themselves comics; a `.zip` opens as an archive and can be read as a comic from there. */
export const COMIC_BOOK_EXTENSIONS: ReadonlySet<string> = new Set(['.cbz', '.cbr']);

export const ARCHIVE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.zip',
  '.rar',
  '.7z',
  '.tar',
  '.gz',
  '.tgz',
  '.bz2',
  '.tbz2',
  '.xz',
  '.txz',
  '.zst',
]);

/** The archives Hearth can look inside; the rest can only be downloaded. */
export const READABLE_ARCHIVE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.zip',
  '.cbz',
  '.rar',
  '.cbr',
]);
export const OFFICE_EXTENSIONS: ReadonlySet<string> = new Set(['.docx', '.doc', '.xlsx', '.xls']);
export const EPUB_EXTENSIONS: ReadonlySet<string> = new Set(['.epub']);
export const PSD_EXTENSIONS: ReadonlySet<string> = new Set(['.psd']);
export const FLASH_EXTENSIONS: ReadonlySet<string> = new Set(['.swf']);
export const PDF_EXTENSIONS: ReadonlySet<string> = new Set(['.pdf']);

/** Codecs browsers decode natively; anything else goes through the transcoder. */
export const BROWSER_VIDEO_CODECS: ReadonlySet<string> = new Set(['h264', 'vp8', 'vp9', 'av1']);
export const BROWSER_AUDIO_CODECS: ReadonlySet<string> = new Set([
  'aac',
  'mp3',
  'opus',
  'vorbis',
  'flac',
]);
