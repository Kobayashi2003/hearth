// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  startChunkedUpload: vi.fn(),
  completeChunkedUpload: vi.fn(),
  abortChunkedUpload: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ api, apiBase: '/hearth-api' }));

import { useUploads, type QueuedFile } from '@/features/transfer/uploads';

/** An XMLHttpRequest the test answers by hand. */
class FakeRequest {
  static sent: FakeRequest[] = [];
  url = '';
  status = 0;
  responseText = '';
  withCredentials = false;
  upload: { onprogress: ((event: { loaded: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  aborted = false;
  open(_method: string, url: string) {
    this.url = url;
  }
  send() {
    FakeRequest.sent.push(this);
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  respond(status: number, body = '') {
    this.status = status;
    this.responseText = body;
    this.onload?.();
  }
}

const queued = (name: string, size = 4): QueuedFile => ({
  file: new File(['x'.repeat(size)], name),
  relativePath: name,
});

let client: QueryClient;
function mount() {
  client = new QueryClient();
  vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useUploads(), { wrapper });
}

const statuses = (jobs: Array<{ name: string; status: string }>) =>
  Object.fromEntries(jobs.map(job => [job.name, job.status]));

describe('upload queue', () => {
  beforeEach(() => {
    FakeRequest.sent = [];
    vi.stubGlobal('XMLHttpRequest', FakeRequest);
    let next = 0;
    api.startChunkedUpload.mockImplementation(async ({ size }: { size: number }) => ({
      uploadId: `u${(next += 1)}`,
      chunkSize: 4,
      totalChunks: Math.max(1, Math.ceil(size / 4)),
      receivedChunks: [],
    }));
    api.completeChunkedUpload.mockResolvedValue({ files: [] });
    api.abortChunkedUpload.mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('runs two uploads at a time and starts the next as one finishes', async () => {
    const { result } = mount();
    act(() => result.current.start([queued('a'), queued('b'), queued('c')], 'inbox'));
    await waitFor(() => expect(FakeRequest.sent).toHaveLength(2));
    expect(statuses(result.current.jobs)).toEqual({ a: 'uploading', b: 'uploading', c: 'queued' });

    await act(async () => FakeRequest.sent[0]!.respond(200));
    await waitFor(() => expect(FakeRequest.sent).toHaveLength(3));
    expect(statuses(result.current.jobs)).toMatchObject({ a: 'done', c: 'uploading' });
    expect(api.startChunkedUpload).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'inbox', relativePath: 'a', size: 4 }),
    );
    expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['listing'] });
  });

  it('sends a file in chunks and reports bytes as they go', async () => {
    const { result } = mount();
    act(() => result.current.start([queued('big', 10)], ''));
    await waitFor(() => expect(FakeRequest.sent).toHaveLength(1));
    act(() => FakeRequest.sent[0]!.upload.onprogress?.({ loaded: 2 }));
    expect(result.current.jobs[0]!.sent).toBe(2);

    await act(async () => FakeRequest.sent[0]!.respond(200));
    await waitFor(() => expect(FakeRequest.sent).toHaveLength(2));
    expect(FakeRequest.sent[1]!.url).toBe('/hearth-api/upload/chunked/u1/1');
    await act(async () => FakeRequest.sent[1]!.respond(200));
    await waitFor(() => expect(FakeRequest.sent).toHaveLength(3));
    await act(async () => FakeRequest.sent[2]!.respond(200));

    await waitFor(() => expect(result.current.jobs[0]!.status).toBe('done'));
    expect(result.current.jobs[0]!.sent).toBe(10);
    expect(api.completeChunkedUpload).toHaveBeenCalledWith('u1');
  });

  it('cancels a queued file without sending anything', async () => {
    const { result } = mount();
    act(() => result.current.start([queued('a'), queued('b'), queued('c')], ''));
    await waitFor(() => expect(FakeRequest.sent).toHaveLength(2));
    const third = result.current.jobs.find(job => job.name === 'c')!;
    act(() => result.current.cancel(third.id));
    expect(statuses(result.current.jobs).c).toBe('cancelled');

    await act(async () => FakeRequest.sent[0]!.respond(200));
    await act(async () => FakeRequest.sent[1]!.respond(200));
    await waitFor(() =>
      expect(statuses(result.current.jobs)).toMatchObject({ a: 'done', b: 'done' }),
    );
    expect(FakeRequest.sent).toHaveLength(2);
  });

  it('cancels a file mid-upload and tells the server to drop what it has', async () => {
    const { result } = mount();
    act(() => result.current.start([queued('a')], ''));
    await waitFor(() => expect(FakeRequest.sent).toHaveLength(1));
    act(() => result.current.cancel(result.current.jobs[0]!.id));
    await waitFor(() => expect(result.current.jobs[0]!.status).toBe('cancelled'));
    expect(FakeRequest.sent[0]!.aborted).toBe(true);
    expect(api.abortChunkedUpload).toHaveBeenCalledWith('u1');
  });

  it('marks a refused chunk as failed with the server reason and cleans up', async () => {
    const { result } = mount();
    act(() => result.current.start([queued('a')], ''));
    await waitFor(() => expect(FakeRequest.sent).toHaveLength(1));
    await act(async () =>
      FakeRequest.sent[0]!.respond(507, JSON.stringify({ message: 'Disk full' })),
    );
    await waitFor(() => expect(result.current.jobs[0]!.status).toBe('failed'));
    expect(result.current.jobs[0]!.error).toBe('Disk full');
    expect(api.abortChunkedUpload).toHaveBeenCalledWith('u1');
  });

  it('clears finished jobs but keeps the ones still going', async () => {
    const { result } = mount();
    act(() => result.current.start([queued('a'), queued('b')], ''));
    await waitFor(() => expect(FakeRequest.sent).toHaveLength(2));
    await act(async () => FakeRequest.sent[0]!.respond(200));
    await waitFor(() => expect(statuses(result.current.jobs).a).toBe('done'));
    act(() => result.current.clearFinished());
    expect(result.current.jobs.map(job => job.name)).toEqual(['b']);
  });
});
