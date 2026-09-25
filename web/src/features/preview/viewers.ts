import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { FileEntry } from '@hearth/shared';

import type { ViewerKind } from '@/lib/file-kind';

export interface ViewerProps {
  entry: FileEntry;
}

/** Lazily loaded: the EPUB, comic and highlighting bundles are large and most sessions open none. */
export const VIEWERS: Record<
  Exclude<ViewerKind, 'none'>,
  LazyExoticComponent<ComponentType<ViewerProps>>
> = {
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
};

/** Viewers whose content does not use the arrow keys, so ←/→ can step through the gallery. */
export const STEPS_WITH_ARROWS: ReadonlySet<ViewerKind> = new Set([
  'image',
  'office',
  'html',
  'pdf',
  'flash',
]);
