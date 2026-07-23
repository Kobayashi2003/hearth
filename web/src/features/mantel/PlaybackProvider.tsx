import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { FileEntry } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';

export type RepeatMode = 'off' | 'one' | 'all';

export interface PlaybackState {
  track: FileEntry | null;
  playlist: FileEntry[];
  isPlaying: boolean;
  positionSeconds: number;
  durationSeconds: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
}

interface PlaybackValue extends PlaybackState {
  play: (track: FileEntry, playlist?: FileEntry[]) => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  skip: (delta: number) => void;
  stop: () => void;
}

const PlaybackContext = createContext<PlaybackValue | null>(null);

const VOLUME_KEY = 'hearth.volume';

/**
 * Audio playback, owned above the preview overlay.
 *
 * The `<audio>` element is mounted here for the life of the session, so closing
 * or minimising the preview that started a track does not unmount the element
 * and stop the music. This is the whole reason playback is not simply state
 * inside the audio viewer.
 */
export function PlaybackProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<PlaybackState>(() => ({
    track: null,
    playlist: [],
    isPlaying: false,
    positionSeconds: 0,
    durationSeconds: 0,
    volume: readStoredVolume(),
    muted: false,
    shuffle: false,
    repeat: 'off',
  }));

  const patch = useCallback((changes: Partial<PlaybackState>) => {
    setState(current => ({ ...current, ...changes }));
  }, []);

  const play = useCallback(
    (track: FileEntry, playlist?: FileEntry[]) => {
      patch({
        track,
        positionSeconds: 0,
        ...(playlist ? { playlist } : {}),
      });
      // The `src` change is applied by the effect below; autoplay follows it.
    },
    [patch],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !state.track) return;
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  }, [state.track]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = seconds;
  }, []);

  const setVolume = useCallback(
    (volume: number) => {
      const clamped = Math.min(1, Math.max(0, volume));
      if (audioRef.current) audioRef.current.volume = clamped;
      localStorage.setItem(VOLUME_KEY, String(clamped));
      patch({ volume: clamped, muted: clamped === 0 });
    },
    [patch],
  );

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    patch({ muted: audio.muted });
  }, [patch]);

  const skip = useCallback(
    (delta: number) => {
      setState(current => {
        if (current.playlist.length === 0 || !current.track) return current;

        const index = current.playlist.findIndex(entry => entry.path === current.track?.path);
        const nextIndex = current.shuffle
          ? Math.floor(Math.random() * current.playlist.length)
          : (index + delta + current.playlist.length) % current.playlist.length;

        const next = current.playlist[nextIndex];
        return next ? { ...current, track: next, positionSeconds: 0 } : current;
      });
    },
    [],
  );

  const stop = useCallback(() => {
    audioRef.current?.pause();
    patch({ track: null, isPlaying: false, positionSeconds: 0 });
  }, [patch]);

  // Load and start whenever the track changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.track) return;

    audio.src = mediaUrls.raw(state.track.path);
    audio.volume = state.volume;
    void audio.play().catch(() => undefined);
    // Only the track identity should retrigger a load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.track?.path]);

  const handleEnded = useCallback(() => {
    if (state.repeat === 'one') {
      seek(0);
      void audioRef.current?.play().catch(() => undefined);
      return;
    }
    const index = state.playlist.findIndex(entry => entry.path === state.track?.path);
    const isLast = index === state.playlist.length - 1;
    if (state.repeat === 'all' || !isLast) skip(1);
    else patch({ isPlaying: false });
  }, [state.repeat, state.playlist, state.track?.path, seek, skip, patch]);

  const value = useMemo<PlaybackValue>(
    () => ({
      ...state,
      play,
      toggle,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle: () => patch({ shuffle: !state.shuffle }),
      cycleRepeat: () =>
        patch({ repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off' }),
      skip,
      stop,
    }),
    [state, play, toggle, seek, setVolume, toggleMute, skip, stop, patch],
  );

  return (
    <PlaybackContext value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => patch({ isPlaying: true })}
        onPause={() => patch({ isPlaying: false })}
        onTimeUpdate={event => patch({ positionSeconds: event.currentTarget.currentTime })}
        onDurationChange={event => patch({ durationSeconds: event.currentTarget.duration || 0 })}
        onEnded={handleEnded}
      />
    </PlaybackContext>
  );
}

export function usePlayback(): PlaybackValue {
  const value = use(PlaybackContext);
  if (!value) throw new Error('usePlayback must be used inside PlaybackProvider');
  return value;
}

function readStoredVolume(): number {
  const stored = Number.parseFloat(localStorage.getItem(VOLUME_KEY) ?? '');
  return Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : 1;
}
