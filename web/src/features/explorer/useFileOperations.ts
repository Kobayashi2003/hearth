import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { FileEntry, OperationResponse } from '@hearth/shared';

import { api, mediaUrls } from '@/lib/api';

interface Clipboard {
  paths: string[];
  mode: 'copy' | 'cut';
}

export function useFileOperations(currentPath: string, onDone: () => void) {
  const queryClient = useQueryClient();
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);

  const refresh = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ['listing'] }),
    [queryClient],
  );

  /** Batch endpoints answer per path, so success is a count and a partial failure names the first reason. */
  const run = useCallback(
    async (done: string, operation: () => Promise<OperationResponse | unknown>) => {
      try {
        const outcome = (await operation()) as Partial<OperationResponse> | undefined;
        const failures = outcome?.results?.filter(result => !result.ok) ?? [];
        if (failures.length > 0)
          toast.error(`${failures.length} could not be processed`, {
            description: failures[0]?.error,
          });
        else toast.success(done);
        onDone();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'That did not work');
      } finally {
        refresh();
      }
    },
    [onDone, refresh],
  );

  const download = useCallback((entries: FileEntry[]) => {
    const only = entries.length === 1 ? entries[0] : undefined;
    if (only && !only.isDirectory) {
      window.location.href = mediaUrls.download(only.path);
      return;
    }
    api
      .requestZip(entries.map(entry => entry.path))
      .then(ticket => {
        window.location.href = mediaUrls.zip(ticket.token);
      })
      .catch(error =>
        toast.error('The download could not be prepared', {
          description: error instanceof Error ? error.message : undefined,
        }),
      );
  }, []);

  const paste = useCallback(() => {
    if (!clipboard) return;
    const { paths, mode } = clipboard;
    void run(mode === 'copy' ? `Copied ${paths.length} here` : `Moved ${paths.length} here`, () =>
      mode === 'copy' ? api.copy(paths, currentPath) : api.move(paths, currentPath),
    );
    // A cut is spent once pasted; a copy can be pasted again.
    if (mode === 'cut') setClipboard(null);
  }, [clipboard, currentPath, run]);

  return {
    run,
    refresh,
    download,
    clipboard,
    copy: (entries: FileEntry[]) =>
      setClipboard({ paths: entries.map(entry => entry.path), mode: 'copy' }),
    cut: (entries: FileEntry[]) =>
      setClipboard({ paths: entries.map(entry => entry.path), mode: 'cut' }),
    clearClipboard: () => setClipboard(null),
    paste,
  };
}

export type FileOperations = ReturnType<typeof useFileOperations>;
