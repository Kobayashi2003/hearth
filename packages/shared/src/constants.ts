import type { MediaKind, SortField, SortDirection } from './entities.js';

export const SORT_FIELDS: readonly SortField[] = ['name', 'size', 'mtime', 'type'];
export const SORT_DIRECTIONS: readonly SortDirection[] = ['asc', 'desc'];
export const MEDIA_KINDS: readonly MediaKind[] = ['image', 'audio', 'video'];

export const DEFAULT_PAGE_SIZE = 100;
/**
 * A folder is delivered whole — the explorer virtualises it, and paginating a
 * file listing makes "select all", "sort", and End mean "…of this page", which
 * is not what any of them should mean.
 *
 * The ceiling is a safety valve rather than a page size: an entry is ~225 bytes
 * of JSON, so 20 000 is about 4.3 MB. Past that the response says `hasMore` and
 * the explorer tells the user it is showing a prefix, instead of silently
 * pretending the rest of the folder does not exist.
 */
export const MAX_PAGE_SIZE = 20_000;

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

/**
 * Extension → MIME overrides applied ahead of the `mime-types` database,
 * which returns a wrong or missing type for these.
 */
export const EXTENSION_MIME_OVERRIDES: Readonly<Record<string, string>> = {
  '.ts': 'text/typescript', // mime-types → video/mp2t
  '.tsx': 'text/typescript',
  '.jsx': 'text/javascript',
  '.vue': 'text/x-vue',
  '.svelte': 'text/x-svelte',
  '.cbz': 'application/x-cbz', // mime-types → application/x-cbr
  '.cbr': 'application/x-cbr',
  '.opus': 'audio/opus',
  '.flac': 'audio/flac',
  '.sh': 'text/x-shellscript',
  '.bat': 'text/plain',
  '.cmd': 'text/plain',
  '.cfg': 'text/plain',
  '.env': 'text/plain',
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

/** File classes that get a dedicated viewer rather than a generic download. */

/**
 * Archives whose first image can stand as a cover — a comic's page one.
 *
 * Wider than [[COMIC_BOOK_EXTENSIONS]] on purpose: plenty of manga arrives as a
 * plain `.zip`, and asking for its cover costs nothing when there is none.
 */
export const COMIC_EXTENSIONS: ReadonlySet<string> = new Set(['.zip', '.cbz', '.rar', '.cbr']);

/**
 * Archives that *declare* themselves comics. Only these open in the comic reader
 * unasked; a `.zip` opens as an archive, because a zip of tax documents paged
 * through as a comic is worse than useless, and the reader is one click away for
 * the ones that are comics after all.
 */
export const COMIC_BOOK_EXTENSIONS: ReadonlySet<string> = new Set(['.cbz', '.cbr']);

/** Everything treated as an archive, whether or not the contents can be read. */
export const ARCHIVE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.tbz2', '.xz', '.txz', '.zst',
]);

/**
 * The archives Hearth can actually look inside. The rest are still recognised as
 * archives — they get an honest "download it to open it" rather than an error.
 */
export const READABLE_ARCHIVE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.zip', '.cbz', '.rar', '.cbr',
]);
export const OFFICE_EXTENSIONS: ReadonlySet<string> = new Set(['.docx', '.doc', '.xlsx', '.xls']);
export const EPUB_EXTENSIONS: ReadonlySet<string> = new Set(['.epub']);
export const PSD_EXTENSIONS: ReadonlySet<string> = new Set(['.psd']);
export const FLASH_EXTENSIONS: ReadonlySet<string> = new Set(['.swf']);
export const PDF_EXTENSIONS: ReadonlySet<string> = new Set(['.pdf']);

/**
 * Container/codec combinations browsers decode natively. Anything outside this
 * set is routed through the Kiln transcoder.
 */
export const BROWSER_VIDEO_CODECS: ReadonlySet<string> = new Set(['h264', 'vp8', 'vp9', 'av1']);
export const BROWSER_AUDIO_CODECS: ReadonlySet<string> = new Set([
  'aac',
  'mp3',
  'opus',
  'vorbis',
  'flac',
]);
