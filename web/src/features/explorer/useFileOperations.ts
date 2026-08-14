import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { FileEntry } from '@hearth/shared';

import { api, mediaUrls } from '@/lib/api';

/**
 * Doing things to files: the clipboard, the downloads, and the shared reporting
 * every one of them ends with. None of it is about the explorer, so none of it
 * lives in the explorer page.
 */

interface Clipboard {
  paths: string[];
  mode: 'copy' | 'cut';
}

/**
 * A batch endpoint answers with a result per path, so "it worked" is a count
 * rather than a status code. A partial failure reports the first reason.
 */
export interface OperationRunner {
  (label: string, operation: () => Promise<unknown>): void;
}

export function useFileOperations({
  selectedEntries,
  currentPath,
  refresh,
  clearSelection,
}: {
  selectedEntries: FileEntry[];
  currentPath: string;
  refresh: () => void;
  clearSelection: () => void;
}) {
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);

  const run = useCallback<OperationRunner>(
    (label, operation) => {
      void (async () => {
        try {
          const outcome = (await operation()) as { results?: Array<{ ok: boolean; error?: string }> };
          const failures = outcome?.results?.filter(result => !result.ok) ?? [];
          if (failures.length > 0) {
            toast.error(`${label}: ${failures.length} failed`, { description: failures[0]?.error });
          } else {
            toast.success(label);
          }
          clearSelection();
          refresh();
        } catch (error) {
          toast.error(label, { description: error instanceof Error ? error.message : undefined });
        }
      })();
    },
    [clearSelection, refresh],
  );

  // One file goes down as itself; anything else is zipped first, which is a
  // server job and arrives as a ticket.
  const download = useCallback(() => {
    if (selectedEntries.length === 0) return;

    const only = selectedEntries.length === 1 ? selectedEntries[0] : undefined;
    if (only && !only.isDirectory) {
      window.location.href = mediaUrls.download(only.path);
      return;
    }

    void api
      .requestZip(selectedEntries.map(entry => entry.path))
      .then(ticket => {
        window.location.href = mediaUrls.zip(ticket.token);
      })
      .catch(error => {
        toast.error('Could not prepare the download', {
          description: error instanceof Error ? error.message : undefined,
        });
      });
  }, [selectedEntries]);

  const copy = useCallback(
    () => setClipboard({ paths: selectedEntries.map(entry => entry.path), mode: 'copy' }),
    [selectedEntries],
  );

  const cut = useCallback(
    () => setClipboard({ paths: selectedEntries.map(entry => entry.path), mode: 'cut' }),
    [selectedEntries],
  );

  const paste = useCallback(() => {
    if (!clipboard) return;
    const label = clipboard.mode === 'copy' ? 'Copied' : 'Moved';
    run(label, () =>
      clipboard.mode === 'copy'
        ? api.copy(clipboard.paths, currentPath)
        : api.move(clipboard.paths, currentPath),
    );
    // A cut is spent once pasted; a copy stays on the clipboard.
    if (clipboard.mode === 'cut') setClipboard(null);
  }, [clipboard, currentPath, run]);

  const remove = useCallback(
    () => run('Deleted', () => api.remove(selectedEntries.map(entry => entry.path))),
    [run, selectedEntries],
  );

  return {
    run,
    clipboardCount: clipboard?.paths.length ?? 0,
    hasClipboard: clipboard !== null,
    copy,
    cut,
    paste,
    download,
    remove,
  };
}
