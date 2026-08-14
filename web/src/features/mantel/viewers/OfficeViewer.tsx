import { useQuery } from '@tanstack/react-query';
import { FileWarning } from 'lucide-react';

import { Spinner, StatusPanel } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { ViewerChrome } from '../ViewerChrome';
import type { ViewerProps } from './types';

/**
 * Word and spreadsheet documents, converted to HTML on the server and
 * sanitised there — this component renders an already-safe fragment.
 */
export default function OfficeViewer({ item, onStep, ...chrome }: ViewerProps) {
  const { data, isPending, error } = useQuery({
    queryKey: ['office', item.entry.path],
    queryFn: ({ signal }) => api.readOffice(item.entry.path, signal),
    staleTime: Infinity,
  });

  return (
    <ViewerChrome item={item} onStep={onStep} flow="document" {...chrome}>
      {isPending ? (
        <div className="flex h-full items-center justify-center">
          <Spinner className="h-6 w-6" />
        </div>
      ) : error ? (
        <StatusPanel
          icon={<FileWarning className="h-8 w-8" />}
          title="Could not open this document"
          description={error instanceof Error ? error.message : undefined}
        />
      ) : (
        <div className="h-full overflow-auto bg-surface">
          <article
            className="prose-hearth mx-auto max-w-4xl px-6 py-8"
            dangerouslySetInnerHTML={{ __html: data?.html ?? '' }}
          />
        </div>
      )}
    </ViewerChrome>
  );
}
