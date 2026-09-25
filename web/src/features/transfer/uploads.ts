import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { api, apiBase } from '@/lib/api';
import { clientLimits } from '@/lib/limits';

export interface QueuedFile {
  file: File;
  /** Path relative to the destination, including folders for a folder upload. */
  relativePath: string;
}

export interface UploadJob {
  id: string;
  name: string;
  destination: string;
  size: number;
  sent: number;
  status: 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled';
  error?: string;
}

/** One chunk over XHR, because fetch cannot report upload progress. */
function sendChunk(
  uploadId: string,
  index: number,
  blob: Blob,
  onProgress: (loaded: number) => void,
  signal: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${apiBase}/upload/chunked/${uploadId}/${index}`);
    request.withCredentials = true;
    request.upload.onprogress = event => onProgress(event.loaded);
    request.onload = () =>
      request.status < 300
        ? resolve()
        : reject(
            new Error(safeMessage(request.responseText) ?? `Upload failed (${request.status})`),
          );
    request.onerror = () => reject(new Error('The connection dropped'));
    request.onabort = () => reject(new DOMException('Cancelled', 'AbortError'));
    signal.addEventListener('abort', () => request.abort(), { once: true });
    const form = new FormData();
    form.append('chunk', blob);
    request.send(form);
  });
}

function safeMessage(body: string): string | null {
  try {
    return (JSON.parse(body) as { message?: string }).message ?? null;
  } catch {
    return null;
  }
}

export function useUploads() {
  const queryClient = useQueryClient();
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const queue = useRef<Array<{ job: UploadJob; file: File; relativePath: string }>>([]);
  const running = useRef(0);

  const patch = useCallback((id: string, changes: Partial<UploadJob>) => {
    setJobs(current => current.map(job => (job.id === id ? { ...job, ...changes } : job)));
  }, []);

  const runOne = useCallback(
    async ({ job, file, relativePath }: { job: UploadJob; file: File; relativePath: string }) => {
      const controller = new AbortController();
      controllers.current.set(job.id, controller);
      patch(job.id, { status: 'uploading' });
      let uploadId: string | null = null;
      try {
        const session = await api.startChunkedUpload({
          path: job.destination,
          relativePath,
          size: file.size,
          chunkSize: 0,
        });
        uploadId = session.uploadId;
        for (let index = 0; index < session.totalChunks; index += 1) {
          const start = index * session.chunkSize;
          await sendChunk(
            session.uploadId,
            index,
            file.slice(start, start + session.chunkSize),
            loaded => patch(job.id, { sent: Math.min(file.size, start + loaded) }),
            controller.signal,
          );
        }
        await api.completeChunkedUpload(session.uploadId);
        patch(job.id, { status: 'done', sent: file.size });
      } catch (error) {
        if (uploadId) void api.abortChunkedUpload(uploadId).catch(() => undefined);
        const cancelled = controller.signal.aborted;
        patch(
          job.id,
          cancelled
            ? { status: 'cancelled' }
            : { status: 'failed', error: error instanceof Error ? error.message : 'Upload failed' },
        );
      } finally {
        controllers.current.delete(job.id);
      }
    },
    [patch],
  );

  const pump = useCallback(() => {
    while (running.current < clientLimits.parallelUploads && queue.current.length > 0) {
      const next = queue.current.shift()!;
      running.current += 1;
      void runOne(next).finally(() => {
        running.current -= 1;
        void queryClient.invalidateQueries({ queryKey: ['listing'] });
        pump();
      });
    }
  }, [runOne, queryClient]);

  const start = useCallback(
    (files: QueuedFile[], destination: string) => {
      const created = files.map(({ file, relativePath }) => ({
        job: {
          id: crypto.randomUUID(),
          name: relativePath,
          destination,
          size: file.size,
          sent: 0,
          status: 'queued' as const,
        },
        file,
        relativePath,
      }));
      setJobs(current => [...current, ...created.map(item => item.job)]);
      queue.current.push(...created);
      pump();
    },
    [pump],
  );

  const cancel = useCallback((id: string) => {
    const controller = controllers.current.get(id);
    if (controller) controller.abort();
    else {
      queue.current = queue.current.filter(item => item.job.id !== id);
      setJobs(current =>
        current.map(job => (job.id === id ? { ...job, status: 'cancelled' } : job)),
      );
    }
  }, []);

  const clearFinished = useCallback(
    () =>
      setJobs(current =>
        current.filter(job => job.status === 'queued' || job.status === 'uploading'),
      ),
    [],
  );

  return { jobs, start, cancel, clearFinished };
}

/** Walks dropped folders; a plain file list loses the directory structure. */
export async function collectDropped(transfer: DataTransfer): Promise<QueuedFile[]> {
  const entries = [...transfer.items]
    .map(item => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));
  if (entries.length === 0)
    return [...transfer.files].map(file => ({ file, relativePath: file.name }));

  const collected: QueuedFile[] = [];
  async function walk(entry: FileSystemEntry, prefix: string): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      collected.push({ file, relativePath: prefix + entry.name });
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries returns batches; keep reading until it returns none.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (batch.length === 0) break;
      for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
    }
  }
  for (const entry of entries) await walk(entry, '');
  return collected;
}

export function fromInput(files: FileList | null): QueuedFile[] {
  return [...(files ?? [])].map(file => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }));
}
