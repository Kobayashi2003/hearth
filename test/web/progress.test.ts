// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Progress } from '@hearth/shared';

const api = vi.hoisted(() => ({
  progress: vi.fn(),
  patchProgress: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ api }));

const at = (seconds: number): Progress => ({
  kind: 'time',
  at: seconds,
  total: 100,
  percent: seconds,
  savedAt: 0,
});

/** The outbox is module state: each test gets a fresh copy of the module. */
async function mount() {
  vi.resetModules();
  const { useProgress } = await import('@/features/progress/progress');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const hook = renderHook(() => useProgress(), { wrapper });
  await waitFor(() => expect(hook.result.current.isReady).toBe(true));
  return hook;
}

describe('progress outbox', () => {
  beforeEach(() => {
    api.progress.mockResolvedValue({ 'old.mp4': at(5) });
    api.patchProgress.mockImplementation(async (payload: object) => payload);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('reads saved positions once loaded', async () => {
    const { result } = await mount();
    expect(result.current.progressFor('old.mp4')?.at).toBe(5);
  });

  it('coalesces a burst of saves into one write carrying the newest position per file', async () => {
    const { result } = await mount();
    vi.useFakeTimers();
    act(() => {
      result.current.save('film.mkv', at(10));
      result.current.save('film.mkv', at(11));
      result.current.save('film.mkv', at(12));
      result.current.save('book.epub', at(40));
    });
    expect(api.patchProgress).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(api.patchProgress).toHaveBeenCalledTimes(1);
    expect(api.patchProgress).toHaveBeenCalledWith({ 'film.mkv': at(12), 'book.epub': at(40) });
  });

  it('flushes at once when the tab is hidden, so the last position is not lost', async () => {
    const { result } = await mount();
    act(() => result.current.save('film.mkv', at(30)));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    expect(api.patchProgress).toHaveBeenCalledWith({ 'film.mkv': at(30) });
  });

  it('sends a forget as null and shares the server answer with every reader', async () => {
    const { result } = await mount();
    api.patchProgress.mockResolvedValueOnce({ 'book.epub': at(41) });
    act(() => result.current.forget('old.mp4'));
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(api.patchProgress).toHaveBeenCalledWith({ 'old.mp4': null });
    await waitFor(() => expect(result.current.progressFor('book.epub')?.at).toBe(41));
    expect(result.current.progressFor('old.mp4')).toBeUndefined();
  });

  it('swallows a failed write; the next save carries a newer position anyway', async () => {
    const { result } = await mount();
    api.patchProgress.mockRejectedValueOnce(new Error('offline'));
    act(() => result.current.save('film.mkv', at(50)));
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(api.patchProgress).toHaveBeenCalledTimes(1);
    expect(result.current.progressFor('old.mp4')?.at).toBe(5);
  });
});
