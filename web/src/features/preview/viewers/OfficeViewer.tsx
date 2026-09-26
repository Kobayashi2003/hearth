import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { ViewerFrame } from '../ViewerFrame';
import type { ViewerProps } from '../viewers';
import { Loaded } from './simple';

/** Word and Excel files, converted to HTML and sanitised on the server. */
export default function OfficeViewer({ entry }: ViewerProps) {
  const query = useQuery({
    queryKey: ['office', entry.path],
    queryFn: ({ signal }) => api.readOffice(entry.path, signal),
    staleTime: Infinity,
    retry: false,
  });

  return (
    <ViewerFrame entry={entry} tone="paper">
      <Loaded query={query} failure="This document could not be opened">
        {data => (
          <div className="scroll-thin absolute inset-0 overflow-auto">
            <article
              className="prose-doc mx-auto max-w-5xl px-6 py-8 [&_table]:text-[13px]"
              dangerouslySetInnerHTML={{ __html: data.html }}
            />
          </div>
        )}
      </Loaded>
    </ViewerFrame>
  );
}
