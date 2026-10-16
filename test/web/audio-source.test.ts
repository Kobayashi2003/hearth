// @vitest-environment jsdom
import { createElement, type ReactNode, type SyntheticEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileEntry } from '@hearth/shared';

const api = vi.hoisted(() => ({
  // Left two minutes into a three-minute track.
  progress: vi.fn(async () => ({
    'music/album.ape': { kind: 'time', at: 120, total: 180, percent: 66, savedAt: 0 },
  })),
  patchProgress: vi.fn(),
  probe: vi.fn(async () => ({ durationSeconds: 180 })),
}));
vi.mock('@/lib/api', () => ({
  api,
  mediaUrls: {
    raw: (path: string) => `/raw?path=${path}`,
    audio: (path: string, start: number) => `/audio?path=${path}&start=${start}`,
  },
}));

const { useAudioSource } = await import('@/features/preview/audio/source');

const track = { path: 'music/album.ape', name: 'album.ape' } as FileEntry;

/** jsdom has the element but not playback; these are what the hook calls. */
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

async function mount() {
  const audio = document.createElement('audio');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const hook = renderHook(() => useAudioSource({ current: audio }, track), { wrapper });
  // Progress loads before a refused file knows where to resume.
  await waitFor(() => expect(api.progress).toHaveBeenCalled());
  await act(async () => {});
  return { audio, hook };
}

/** What the element reports when it cannot decode its source. */
function refuse(audio: HTMLAudioElement) {
  Object.defineProperty(audio, 'error', { value: { code: 4 }, configurable: true });
  return { currentTarget: audio } as unknown as SyntheticEvent<HTMLAudioElement>;
}

describe('useAudioSource', () => {
  it('plays the file itself first', async () => {
    const { audio, hook } = await mount();
    expect(audio.src).toContain('/raw?path=music/album.ape');
    expect(hook.result.current.converting).toBe(false);
  });

  it('switches to a conversion from where it was left when the browser refuses the file', async () => {
    const { audio, hook } = await mount();
    act(() => hook.result.current.events.onError(refuse(audio)));

    expect(audio.src).toContain('/audio?path=music/album.ape&start=120');
    expect(hook.result.current.position).toBe(120);
    await waitFor(() => expect(hook.result.current.duration).toBe(180));
  });

  it('seeks in a conversion by starting it again there', async () => {
    const { audio, hook } = await mount();
    act(() => hook.result.current.events.onError(refuse(audio)));
    act(() => hook.result.current.seek(30));

    expect(audio.src).toContain('&start=30');
    expect(hook.result.current.position).toBe(30);
  });
});
