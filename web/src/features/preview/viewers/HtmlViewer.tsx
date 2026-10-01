import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { ViewerFrame } from '../ViewerFrame';
import type { ViewerProps } from '../overlay';
import { Loaded } from './simple';

/**
 * Sanitised on the server and shown in a frame with an empty sandbox (no
 * scripts, no same-origin), so the page cannot reach Hearth's session.
 */
export default function HtmlViewer({ entry }: ViewerProps) {
  const query = useQuery({
    queryKey: ['html', entry.path],
    queryFn: () => api.readHtml(entry.path),
    staleTime: Infinity,
    retry: false,
  });

  return (
    <ViewerFrame entry={entry} tone="paper">
      <Loaded query={query} failure="This page could not be opened">
        {data => (
          <div className="absolute inset-0 flex flex-col">
            {!data.externalResources ? (
              <p className="border-b border-line bg-sunken px-4 py-1.5 text-[12.5px] text-ink-2">
                Images and scripts from other sites are blocked. An administrator can allow images
                in Settings.
              </p>
            ) : null}
            <iframe
              title={entry.name}
              srcDoc={data.html}
              sandbox=""
              className="min-h-0 flex-1 bg-white"
            />
          </div>
        )}
      </Loaded>
    </ViewerFrame>
  );
}
