import { useCallback, useRef, useState } from 'react';

import { api } from '@/lib/api';
import { apiUrl } from '@/lib/runtime-config';

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled';

export interface UploadJob {
  id: string;
  /** Path relative to the destination, preserving folder structure. */
  relativePath: string;
  size: number;
  uploadedBytes: number;
  status: UploadStatus;
  error?: string;
}

/** Files at or above this go through the chunked endpoint so they can resume. */
const CHUNKED_THRESHOLD_BYTES = 16 * 1024 * 1024;
const CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
/** Uploading several files at once saturates the link without starving any. */
const MAX_PARALLEL_FILES = 3;

interface QueuedFile {
  file: File;
  relativePath: string;
}

/**
 * Upload queue. Small files go in one request; large ones are cut into chunks
 * so an interrupted upload resumes from what already landed rather than
 * starting a multi-gigabyte transfer again.
 */
export function useUploads(onComplete: () => void) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const cancelled = useRef(new Set<string>());

  const patch = useCallback((id: string, changes: Partial<UploadJob>) => {
    setJobs(current => current.map(job => (job.id === id ? { ...job, ...changes } : job)));
  }, []);

  const cancel = useCallback((id: string) => {
    cancelled.current.add(id);
    patch(id, { status: 'cancelled' });
  }, [patch]);

  const clearFinished = useCallback(() => {
    setJobs(current => current.filter(job => job.status === 'uploading' || job.status === 'queued'));
  }, []);

  const start = useCallback(
    async (files: QueuedFile[], destination: string) => {
      const queued: UploadJob[] = files.map((entry, index) => ({
        id: `${Date.now()}-${index}-${entry.relativePath}`,
        relativePath: entry.relativePath,
        size: entry.file.size,
        uploadedBytes: 0,
        status: 'queued',
      }));

      setJobs(current => [...current, ...queued]);

      // A simple sliding window: start the next file as one finishes.
      let cursor = 0;
      const workers = Array.from({ length: Math.min(MAX_PARALLEL_FILES, files.length) }, async () => {
        while (cursor < files.length) {
          const index = cursor;
          cursor += 1;
          const entry = files[index]!;
          const job = queued[index]!;
          if (cancelled.current.has(job.id)) continue;

          patch(job.id, { status: 'uploading' });
          try {
            if (entry.file.size >= CHUNKED_THRESHOLD_BYTES) {
              await uploadInChunks(entry, destination, job.id, patch, cancelled.current);
            } else {
              await uploadWhole(entry, destination, job.id, patch, cancelled.current);
            }
            if (!cancelled.current.has(job.id)) {
              patch(job.id, { status: 'done', uploadedBytes: entry.file.size });
            }
          } catch (error) {
            if (!cancelled.current.has(job.id)) {
              patch(job.id, {
                status: 'failed',
                error: error instanceof Error ? error.message : 'Upload failed',
              });
            }
          }
        }
      });

      await Promise.all(workers);
      onComplete();
    },
    [patch, onComplete],
  );

  const active = jobs.filter(job => job.status === 'uploading' || job.status === 'queued');
  const totalBytes = jobs.reduce((sum, job) => sum + job.size, 0);
  const uploadedBytes = jobs.reduce((sum, job) => sum + job.uploadedBytes, 0);

  return {
    jobs,
    activeCount: active.length,
    overallProgress: totalBytes > 0 ? uploadedBytes / totalBytes : 0,
    start,
    cancel,
    clearFinished,
  };
}

type Patch = (id: string, changes: Partial<UploadJob>) => void;

/**
 * XHR rather than fetch, because only XHR reports upload progress — `fetch`
 * has no equivalent of `upload.onprogress` in any shipping browser.
 */
function uploadWhole(
  entry: QueuedFile,
  destination: string,
  jobId: string,
  patch: Patch,
  cancelledIds: Set<string>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    // The field name carries the relative path — see the /upload route.
    form.append(entry.relativePath, entry.file, entry.file.name);

    const request = new XMLHttpRequest();
    request.open('POST', apiUrl('/upload', { path: destination }));
    request.withCredentials = true;

    request.upload.onprogress = event => {
      if (cancelledIds.has(jobId)) request.abort();
      else patch(jobId, { uploadedBytes: event.loaded });
    };
    request.onload = () =>
      request.status < 400 ? resolve() : reject(new Error(errorMessageOf(request)));
    request.onerror = () => reject(new Error('Network error'));
    request.onabort = () => resolve();

    request.send(form);
  });
}

async function uploadInChunks(
  entry: QueuedFile,
  destination: string,
  jobId: string,
  patch: Patch,
  cancelledIds: Set<string>,
): Promise<void> {
  const session = await api.startChunkedUpload({
    path: destination,
    relativePath: entry.relativePath,
    size: entry.file.size,
    chunkSize: CHUNK_SIZE_BYTES,
  });

  const received = new Set(session.receivedChunks);

  for (let index = 0; index < session.totalChunks; index += 1) {
    if (cancelledIds.has(jobId)) {
      await api.abortChunkedUpload(session.uploadId).catch(() => undefined);
      return;
    }
    // A resumed upload skips what the server already holds.
    if (received.has(index)) continue;

    const start = index * session.chunkSize;
    const slice = entry.file.slice(start, start + session.chunkSize);

    const form = new FormData();
    form.append('chunk', slice, 'chunk');

    const response = await fetch(
      apiUrl(`/upload/chunked/${session.uploadId}/${index}`),
      { method: 'POST', body: form, credentials: 'same-origin' },
    );
    if (!response.ok) throw new Error(`Chunk ${index + 1} failed`);

    patch(jobId, { uploadedBytes: Math.min(entry.file.size, start + slice.size) });
  }

  await api.completeChunkedUpload(session.uploadId);
}

function errorMessageOf(request: XMLHttpRequest): string {
  try {
    return (JSON.parse(request.responseText) as { message?: string }).message ?? 'Upload failed';
  } catch {
    return `Upload failed (${request.status})`;
  }
}

/** Flatten a dropped folder into files carrying their relative paths. */
export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<QueuedFile[]> {
  const entries = [...dataTransfer.items]
    .map(item => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));

  if (entries.length === 0) {
    return [...dataTransfer.files].map(file => ({ file, relativePath: file.name }));
  }

  const collected: QueuedFile[] = [];
  await Promise.all(entries.map(entry => walkEntry(entry, '', collected)));
  return collected;
}

async function walkEntry(entry: FileSystemEntry, prefix: string, into: QueuedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    into.push({ file, relativePath: prefix + entry.name });
    return;
  }

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries returns at most 100 at a time; keep reading until it is empty.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) break;
    await Promise.all(batch.map(child => walkEntry(child, `${prefix}${entry.name}/`, into)));
  }
}

/** Files chosen through a picker; `webkitRelativePath` is set for a folder pick. */
export function collectPickedFiles(fileList: FileList): QueuedFile[] {
  return [...fileList].map(file => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }));
}
