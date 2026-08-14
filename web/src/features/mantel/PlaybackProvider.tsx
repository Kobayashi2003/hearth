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

import { positionToResume, positionToStore } from './resume';

import { mediaUrls } from '@/lib/api';
import { useLedger } from '@/features/ledger/useLedger';
import { useMediaSession } from './viewers/video/useMediaSession';

/** `timeupdate` fires several times a second; only every few seconds is stored. */
const SAVE_EVERY_SECONDS = 5;

/** The folder a track sits in, which for a ripped album is the album's name. */
function folderNameOf(path: string | undefined): string {
  if (!path) return '';
  const parts = path.split('/');
  return parts.length > 1 ? (parts[parts.length - 2] ?? '') : '';
}

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
  rate: number;
  /**
   * Whether the viewer shows its playlist column. Held here, not in the viewer,
   * because the viewer is remounted every time the track changes — a panel you
   * opened would fold itself away the moment the album moved on.
   */
  playlistVisible: boolean;
}

interface PlaybackValue extends PlaybackState {
  play: (track: FileEntry, playlist?: FileEntry[]) => void;
  toggle: () => void;
  /** Unconditional, unlike `toggle` — for a viewer taking over the speakers. */
  pause: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setRate: (rate: number) => void;
  togglePlaylist: () => void;
  skip: (delta: number) => void;
  stop: () => void;
  /** The live element, so a visualiser can tap it. Null before first play. */
  audioElement: HTMLAudioElement | null;
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
    rate: 1,
    playlistVisible: true,
  }));

  const { progressFor, saveProgress, markOpened } = useLedger();

  const patch = useCallback((changes: Partial<PlaybackState>) => {
    setState(current => ({ ...current, ...changes }));
  }, []);

  // A ref does not trigger a render, so consumers that need the element itself
  // — the visualiser — would never see it appear. One state flip on mount.
  const [, setElementReady] = useState(false);

  const play = useCallback(
    (track: FileEntry, playlist?: FileEntry[]) => {
      patch({
        track,
        positionSeconds: 0,
        durationSeconds: 0,
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

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

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
        // Duration is cleared with the track, not left to be overwritten when
        // the next `durationchange` lands: until then it belongs to the track
        // that just ended, and progress written against it would be recorded
        // under the new track's name.
        return next
          ? { ...current, track: next, positionSeconds: 0, durationSeconds: 0 }
          : current;
      });
    },
    [],
  );

  const setRate = useCallback(
    (rate: number) => {
      if (audioRef.current) audioRef.current.playbackRate = rate;
      patch({ rate });
    },
    [patch],
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
    audio.playbackRate = state.rate;
    markOpened(state.track.path);

    // Resume where this track was left, once the element knows how long it is.
    const saved = progressFor(state.track.path);
    const storedAt = saved?.kind === 'time' && typeof saved.at === 'number' ? saved.at : 0;
    const onReady = () => {
      const resumeAt = positionToResume(storedAt, audio.duration);
      if (resumeAt > 0) audio.currentTime = resumeAt;
    };
    audio.addEventListener('loadedmetadata', onReady, { once: true });

    void audio.play().catch(() => undefined);
    return () => audio.removeEventListener('loadedmetadata', onReady);
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

  /**
   * Progress is written from here rather than from the viewer, because closing
   * the panel does not stop the music — the whole point of owning the element
   * above the overlay. A track that keeps playing keeps recording.
   */
  const lastSaved = useRef(0);
  useEffect(() => {
    const { track, positionSeconds, durationSeconds } = state;
    if (!track || !durationSeconds) return;
    if (Math.abs(positionSeconds - lastSaved.current) < SAVE_EVERY_SECONDS) return;
    lastSaved.current = positionSeconds;

    saveProgress(track.path, {
      kind: 'time',
      at: positionToStore(positionSeconds, durationSeconds),
      total: durationSeconds,
      percent: Math.min(100, Math.round((positionSeconds / durationSeconds) * 100)),
      savedAt: Date.now(),
    });
  }, [state, saveProgress]);

  useEffect(() => {
    lastSaved.current = 0;
  }, [state.track?.path]);

  const trackIndex = state.playlist.findIndex(entry => entry.path === state.track?.path);
  const canStep = state.playlist.length > 1;

  // Lock screen, notification shade, headphone buttons. Registered here so they
  // keep working after the preview is closed and the dock takes over.
  useMediaSession(state.track !== null, {
    title: state.track?.name ?? '',
    album: folderNameOf(state.track?.path),
    path: state.track?.path ?? '',
    isPlaying: state.isPlaying,
    positionSeconds: state.positionSeconds,
    durationSeconds: state.durationSeconds,
    rate: state.rate,
    onPlay: toggle,
    onPause: toggle,
    onSeek: seek,
    onSeekBy: delta => seek(Math.max(0, state.positionSeconds + delta)),
    onPrevious: canStep && trackIndex >= 0 ? () => skip(-1) : undefined,
    onNext: canStep && trackIndex >= 0 ? () => skip(1) : undefined,
  });

  const value = useMemo<PlaybackValue>(
    () => ({
      ...state,
      play,
      toggle,
      pause,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle: () => patch({ shuffle: !state.shuffle }),
      togglePlaylist: () => patch({ playlistVisible: !state.playlistVisible }),
      cycleRepeat: () =>
        patch({ repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off' }),
      setRate,
      skip,
      stop,
      audioElement: audioRef.current,
    }),
    [state, play, toggle, pause, seek, setVolume, toggleMute, setRate, skip, stop, patch],
  );

  return (
    <PlaybackContext value={value}>
      {children}
      <audio
        ref={element => {
          audioRef.current = element;
          if (element) setElementReady(true);
        }}
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
