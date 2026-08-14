import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  ARCHIVE_EXTENSIONS,
  COMIC_BOOK_EXTENSIONS,
  EPUB_EXTENSIONS,
  FLASH_EXTENSIONS,
  OFFICE_EXTENSIONS,
  PDF_EXTENSIONS,
  type FileEntry,
} from '@hearth/shared';

import type { ViewerProps } from './viewers/types';

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
  | 'unsupported';

const TEXT_MIME_PREFIXES = ['text/', 'application/json', 'application/xml', 'application/javascript'];

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index).toLowerCase();
}

/** Which viewer opens a file. Extension wins where MIME is ambiguous. */
export function viewerKindFor(entry: FileEntry): ViewerKind {
  if (entry.isDirectory) return 'unsupported';

  const extension = extensionOf(entry.name);
  // A `.cbz` is a comic by declaration; a `.zip` is an archive that may turn out
  // to be one, and the archive viewer offers to read it that way.
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

  return 'unsupported';
}

/**
 * Viewers are lazily loaded. The EPUB, comic, Office and syntax-highlighting
 * bundles are large and most sessions open none of them, so they must not sit
 * in the entry chunk.
 */
const VIEWERS: Record<ViewerKind, LazyExoticComponent<ComponentType<ViewerProps>>> = {
  image: lazy(() => import('./viewers/ImageViewer')),
  video: lazy(() => import('./viewers/VideoViewer')),
  audio: lazy(() => import('./viewers/AudioViewer')),
  text: lazy(() => import('./viewers/TextViewer')),
  comic: lazy(() => import('./viewers/ComicViewer')),
  archive: lazy(() => import('./viewers/ArchiveViewer')),
  epub: lazy(() => import('./viewers/EpubViewer')),
  office: lazy(() => import('./viewers/OfficeViewer')),
  html: lazy(() => import('./viewers/HtmlViewer')),
  pdf: lazy(() => import('./viewers/PdfViewer')),
  flash: lazy(() => import('./viewers/FlashViewer')),
  unsupported: lazy(() => import('./viewers/UnsupportedViewer')),
};

export function viewerComponentFor(kind: ViewerKind): LazyExoticComponent<ComponentType<ViewerProps>> {
  return VIEWERS[kind];
}

/**
 * How much of the screen a viewer wants.
 *
 * - `full` — the content benefits from the whole surface (images, video, text,
 *   documents, readers).
 * - `panel` — the content is small and fixed, so it sits in a compact card
 *   rather than a full-page overlay that would strand a little UI in a sea of
 *   empty space. The user can still expand a panel to full.
 */
export type ViewerLayout = 'full' | 'panel';

const PANEL_KINDS: ReadonlySet<ViewerKind> = new Set(['audio', 'unsupported']);

export function viewerLayoutFor(kind: ViewerKind): ViewerLayout {
  return PANEL_KINDS.has(kind) ? 'panel' : 'full';
}

/**
 * How wide a panel wants to be, as a Tailwind class for the `sm:` breakpoint up.
 *
 * Most panels hold one column of controls and 26rem is generous for that. The
 * audio player holds two — the cover and transport beside the playlist — and at
 * 26rem opening the list squeezes the player into a strip barely wider than its
 * own buttons.
 */
export function panelWidthFor(kind: ViewerKind): string {
  return kind === 'audio' ? 'sm:w-[36rem]' : 'sm:w-[26rem]';
}

/** True when a file has a viewer, so the explorer can offer preview on it. */
export function isPreviewable(entry: FileEntry): boolean {
  return !entry.isDirectory && viewerKindFor(entry) !== 'unsupported';
}

/**
 * How a viewer moves between files, if at all.
 *
 * Stepping only makes sense between things of a kind. Flicking through a folder
 * of photos is browsing; the same arrow landing you on a spreadsheet, a
 * half-read novel and back on a photo is not. And a book or a text file is
 * something you are *in* — a "next" that abandons your place mid-chapter is a
 * way to lose your page, not a feature.
 */
export type StepFamily = 'image' | 'video' | 'audio' | 'comic' | null;

const STEP_FAMILY: Partial<Record<ViewerKind, StepFamily>> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  // A comic steps to the next volume in the folder, which is how a series is read.
  comic: 'comic',
  // epub, text, html, pdf, office and flash deliberately do not step.
};

export function stepFamilyOf(entry: FileEntry): StepFamily {
  if (entry.isDirectory) return null;
  return STEP_FAMILY[viewerKindFor(entry)] ?? null;
}

/**
 * The files this one can step through: its siblings of the same family, in
 * listing order. Empty when the file's kind does not step, which is what makes
 * the arrows and the playlist disappear rather than mislead.
 */
export function galleryFor(entry: FileEntry, siblings: FileEntry[]): FileEntry[] {
  const family = stepFamilyOf(entry);
  if (!family) return [];
  return siblings.filter(sibling => stepFamilyOf(sibling) === family);
}
