import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  COMIC_EXTENSIONS,
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
  if (COMIC_EXTENSIONS.has(extension)) return 'comic';
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

/** True when a file has a viewer, so the explorer can offer preview on it. */
export function isPreviewable(entry: FileEntry): boolean {
  return !entry.isDirectory && viewerKindFor(entry) !== 'unsupported';
}
