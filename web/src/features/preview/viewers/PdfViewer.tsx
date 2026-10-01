import { mediaUrls } from '@/lib/api';
import { ViewerFrame } from '../ViewerFrame';
import type { ViewerProps } from '../overlay';

/** Every current browser ships a capable PDF viewer; bundling a second one is not worth megabytes. */
export default function PdfViewer({ entry }: ViewerProps) {
  return (
    <ViewerFrame entry={entry} arrows>
      <iframe
        title={entry.name}
        src={mediaUrls.raw(entry.path)}
        className="absolute inset-0 size-full border-0 bg-stage"
      />
    </ViewerFrame>
  );
}
