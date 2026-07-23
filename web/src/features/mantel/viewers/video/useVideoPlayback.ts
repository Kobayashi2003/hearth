import { useCallback, useEffect, useRef, useState } from 'react';

export interface VideoPlaybackState {
  isPlaying: boolean;
  positionSeconds: number;
  durationSeconds: number;
  bufferedSeconds: number;
  volume: number;
  muted: boolean;
  rate: number;
  isWaiting: boolean;
}

const VOLUME_KEY = 'hearth.volume';

/**
 * Binds React state to a `<video>` element. The element stays the source of
 * truth — state mirrors it rather than driving it — so native controls, the
 * keyboard, and Picture-in-Picture all stay in agreement.
 */
export function useVideoPlayback() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<VideoPlaybackState>({
    isPlaying: false,
    positionSeconds: 0,
    durationSeconds: 0,
    bufferedSeconds: 0,
    volume: readStoredVolume(),
    muted: false,
    rate: 1,
    isWaiting: false,
  });

  const patch = useCallback((changes: Partial<VideoPlaybackState>) => {
    setState(current => ({ ...current, ...changes }));
  }, []);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(seconds)) return;
    video.currentTime = Math.max(0, Math.min(video.duration || seconds, seconds));
  }, []);

  const seekBy = useCallback(
    (delta: number) => seek((videoRef.current?.currentTime ?? 0) + delta),
    [seek],
  );

  const setVolume = useCallback(
    (volume: number) => {
      const video = videoRef.current;
      if (!video) return;
      const clamped = Math.min(1, Math.max(0, volume));
      video.volume = clamped;
      video.muted = clamped === 0;
      localStorage.setItem(VOLUME_KEY, String(clamped));
    },
    [],
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  }, []);

  const setRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (video) video.playbackRate = rate;
  }, []);

  const toggleFullscreen = useCallback(async (container: HTMLElement | null) => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (container) await container.requestFullscreen().catch(() => undefined);
  }, []);

  const togglePictureInPicture = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await video.requestPictureInPicture().catch(() => undefined);
  }, []);

  // Apply the stored volume once the element exists.
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.volume = state.volume;
    // Runs once per mounted element; later changes go through setVolume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef.current]);

  /** Spread onto the `<video>` element to keep state in step with it. */
  const handlers = {
    onPlay: () => patch({ isPlaying: true }),
    onPause: () => patch({ isPlaying: false }),
    onWaiting: () => patch({ isWaiting: true }),
    onPlaying: () => patch({ isWaiting: false, isPlaying: true }),
    onRateChange: (event: React.SyntheticEvent<HTMLVideoElement>) =>
      patch({ rate: event.currentTarget.playbackRate }),
    onVolumeChange: (event: React.SyntheticEvent<HTMLVideoElement>) =>
      patch({ volume: event.currentTarget.volume, muted: event.currentTarget.muted }),
    onDurationChange: (event: React.SyntheticEvent<HTMLVideoElement>) =>
      patch({ durationSeconds: event.currentTarget.duration || 0 }),
    onTimeUpdate: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget;
      const buffered = video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0;
      patch({ positionSeconds: video.currentTime, bufferedSeconds: buffered });
    },
  };

  return {
    videoRef,
    state,
    handlers,
    toggle,
    seek,
    seekBy,
    setVolume,
    toggleMute,
    setRate,
    toggleFullscreen,
    togglePictureInPicture,
  };
}

function readStoredVolume(): number {
  const stored = Number.parseFloat(localStorage.getItem(VOLUME_KEY) ?? '');
  return Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : 1;
}
