// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MediaProbe } from '@hearth/shared';

import { usePlaybackState, useVideoSource } from '@/features/preview/viewers/video/playback';

/** A file the browser plays itself, with a second audio track it would have to convert. */
const probe = {
  browserPlayable: true,
  audioTracks: [
    { index: 0, codec: 'aac', language: 'jpn', title: null },
    { index: 1, codec: 'aac', language: 'eng', title: null },
  ],
} as unknown as MediaProbe;

/** A `timeupdate` from a video element playing `src` at `time`. */
function timeUpdate(src: string, time: number) {
  const video = document.createElement('video');
  video.setAttribute('src', src);
  Object.defineProperty(video, 'currentTime', { value: time });
  return { currentTarget: video } as never;
}

describe('a conversion restarted somewhere else', () => {
  it('does not add the old stream’s time to the new start', () => {
    const { result, rerender } = renderHook(({ source }) => usePlaybackState(source), {
      initialProps: { source: 'convert?start=0' },
    });
    act(() => result.current.events.onTimeUpdate(timeUpdate('convert?start=0', 30)));
    expect(result.current.state.time).toBe(30);

    // Sought to 300: a new stream, which has not said where it is yet.
    rerender({ source: 'convert?start=300' });
    expect(result.current.state.time).toBe(0);

    act(() => result.current.events.onTimeUpdate(timeUpdate('convert?start=300', 2)));
    expect(result.current.state.time).toBe(2);
  });
});

describe('switching audio tracks', () => {
  it('goes back to the original file at the same moment, without the conversion’s start', () => {
    const { result } = renderHook(() => useVideoSource('film.mkv', probe));
    expect(result.current.transcoding).toBe(false);

    act(() => result.current.chooseAudio(1, 120));
    expect(result.current.transcoding).toBe(true);
    expect(result.current.offset).toBe(120);
    expect(result.current.takePendingSeek()).toBeNull();

    act(() => result.current.chooseAudio(0, 200));
    expect(result.current.transcoding).toBe(false);
    expect(result.current.offset).toBe(0);
    // Sought there once the original loads, and only once.
    expect(result.current.takePendingSeek()).toBe(200);
    expect(result.current.takePendingSeek()).toBeNull();
  });
});
