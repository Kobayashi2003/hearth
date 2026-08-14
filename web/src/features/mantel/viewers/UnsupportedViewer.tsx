import { Download, FileQuestion } from 'lucide-react';

import { StatusPanel } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { mediaUrls } from '@/lib/api';
import { formatSize } from '@/lib/format';
import { ViewerChrome } from '../ViewerChrome';
import type { ViewerProps } from './types';

/** No viewer handles this type — offer the action that does work. */
export default function UnsupportedViewer({ item, onStep, ...chrome }: ViewerProps) {
  return (
    <ViewerChrome item={item} onStep={onStep} flow="document" {...chrome}>
      <StatusPanel
        icon={<FileQuestion className="h-10 w-10" />}
        title="No preview for this file type"
        description={`${item.entry.mimeType} · ${formatSize(item.entry.size)}`}
        action={
          <Button
            variant="primary"
            onClick={() => {
              window.location.href = mediaUrls.download(item.entry.path);
            }}
          >
            <Download className="h-4 w-4" /> Download
          </Button>
        }
      />
    </ViewerChrome>
  );
}
