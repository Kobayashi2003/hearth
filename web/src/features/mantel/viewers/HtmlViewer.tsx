import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';

import { Spinner, StatusPanel } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { ViewerChrome } from '../ViewerChrome';
import type { ViewerProps } from './types';

/**
 * Local HTML, sanitised on the server and rendered inside a sandboxed frame.
 *
 * The sandbox carries no `allow-scripts` and no `allow-same-origin`, so a saved
 * page cannot run code or reach Hearth's own session — the sanitiser and the
 * sandbox are two independent barriers rather than one.
 */
export default function HtmlViewer({ item, onStep, ...chrome }: ViewerProps) {
  const { data, isPending, error } = useQuery({
    queryKey: ['html', item.entry.path],
    queryFn: () => api.readHtml(item.entry.path),
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
          icon={<ShieldAlert className="h-8 w-8" />}
          title="Could not open this page"
          description={error instanceof Error ? error.message : undefined}
        />
      ) : (
        <div className="flex h-full flex-col">
          {!data?.externalResources ? (
            <p className="border-b border-subtle bg-sunken px-4 py-1.5 text-xs text-muted">
              External images and scripts are blocked. An administrator can allow them in Settings.
            </p>
          ) : null}
          <iframe
            title={item.entry.name}
            srcDoc={data?.html ?? ''}
            sandbox=""
            className="min-h-0 flex-1 bg-white"
          />
        </div>
      )}
    </ViewerChrome>
  );
}
