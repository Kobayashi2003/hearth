import { mediaUrls } from '@/lib/api';
import { ViewerChrome } from '../ViewerChrome';
import type { ViewerProps } from './types';

/**
 * PDFs are handed to the browser's own viewer. Every current browser ships a
 * capable one, and bundling a second renderer would add megabytes to serve a
 * format the platform already handles well.
 */
export default function PdfViewer({ item, onStep, ...chrome }: ViewerProps) {
  return (
    <ViewerChrome item={item} onStep={onStep} contentClassName="bg-hearth-950" {...chrome}>
      <iframe
        title={item.entry.name}
        src={mediaUrls.raw(item.entry.path)}
        className="h-full w-full border-0"
      />
    </ViewerChrome>
  );
}
