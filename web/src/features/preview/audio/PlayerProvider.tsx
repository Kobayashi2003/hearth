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
import { baseName, parentOf } from '@/lib/format';
import { local } from '@/lib/storage';
import { percentOf, useProgress } from '@/features/progress/progress';
import { useMediaSession } from './useMediaSession';

export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerValue {
  track: FileEntry | null;
  playlist: FileEntry[];
  isPlaying: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  play: (track: FileEntry, playlist?: FileEntry[]) => void;
  toggle: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  skip: (delta: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  stop: () => void;
}

const PlayerContext = createContext<PlayerValue | null>(null);
const VOLUME_KEY = 'hearth.volume';
const SAVE_EVERY_SECONDS = 5;
/** Too little to be worth resuming, or so close to the end that the track is done. */
const RESUME_MIN_SECONDS = 20;
const RESUME_END_MARGIN = 10;

/**
 * Audio lives here, above the preview overlay, so closing the preview that
 * started a track does not unmount the element and stop the music.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<FileEntry | null>(null);
  const [playlist, setPlaylist] = useState<FileEntry[]>([]);
  const [isPlaying, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(() => clampVolume(Number(local.get(VOLUME_KEY) ?? 1)));
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const { progressFor, save } = useProgress();
  const lastSaved = useRef(0);

  const play = useCallback(
    (next: FileEntry, list?: FileEntry[]) => {
      if (list) setPlaylist(list);
      if (track?.path === next.path) void audioRef.current?.play().catch(() => undefined);
      else setTrack(next);
    },
    [track?.path],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  }, []);

  const pause = useCallback(() => audioRef.current?.pause(), []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(seconds)) audio.currentTime = Math.max(0, seconds);
  }, []);

  const skip = useCallback(
    (delta: number) => {
      if (!track || playlist.length === 0) return;
      const index = playlist.findIndex(item => item.path === track.path);
      const nextIndex = shuffle
        ? Math.floor(Math.random() * playlist.length)
        : (index + delta + playlist.length) % playlist.length;
      const next = playlist[nextIndex];
      if (next) setTrack(next);
    },
    [track, playlist, shuffle],
  );

  const setVolume = useCallback((next: number) => {
    const clamped = clampVolume(next);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
      audioRef.current.muted = false;
    }
    setVolumeState(clamped);
    local.set(VOLUME_KEY, String(clamped));
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (audio) audio.muted = !audio.muted;
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setTrack(null);
    setPlaylist([]);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!track) {
      audio.removeAttribute('src');
      audio.load();
      return;
    }
    audio.src = mediaUrls.raw(track.path);
    audio.volume = volume;
    lastSaved.current = 0;
    setPosition(0);
    setDuration(0);

    const saved = progressFor(track.path);
    const resumeAt = saved?.kind === 'time' && typeof saved.at === 'number' ? saved.at : 0;
    const onReady = () => {
      if (resumeAt > RESUME_MIN_SECONDS && resumeAt < audio.duration - RESUME_END_MARGIN)
        audio.currentTime = resumeAt;
    };
    audio.addEventListener('loadedmetadata', onReady, { once: true });
    void audio.play().catch(() => undefined);
    return () => audio.removeEventListener('loadedmetadata', onReady);
    // Only a new track reloads the element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.path]);

  // Written from here, not the viewer, because playback outlives the viewer.
  useEffect(() => {
    if (!track || !duration || Math.abs(position - lastSaved.current) < SAVE_EVERY_SECONDS) return;
    lastSaved.current = position;
    save(track.path, {
      kind: 'time',
      at: position,
      total: duration,
      percent: percentOf(position, duration),
      savedAt: Date.now(),
    });
  }, [track, position, duration, save]);

  const onEnded = () => {
    if (track)
      save(track.path, { kind: 'time', at: 0, total: duration, percent: 100, savedAt: Date.now() });
    if (repeat === 'one') {
      seek(0);
      void audioRef.current?.play().catch(() => undefined);
      return;
    }
    const isLast = playlist.findIndex(item => item.path === track?.path) === playlist.length - 1;
    if (repeat === 'all' || shuffle || !isLast) skip(1);
  };

  const index = track ? playlist.findIndex(item => item.path === track.path) : -1;
  useMediaSession(track !== null, {
    title: track?.name ?? '',
    album: track ? baseName(parentOf(track.path)) : '',
    artworkPath: track?.path ?? '',
    isPlaying,
    position,
    duration,
    onPlay: toggle,
    onPause: pause,
    onSeek: seek,
    onPrevious: playlist.length > 1 && index >= 0 ? () => skip(-1) : undefined,
    onNext: playlist.length > 1 && index >= 0 ? () => skip(1) : undefined,
  });

  const value = useMemo<PlayerValue>(
    () => ({
      track,
      playlist,
      isPlaying,
      position,
      duration,
      volume,
      muted,
      shuffle,
      repeat,
      play,
      toggle,
      pause,
      seek,
      skip,
      setVolume,
      toggleMute,
      toggleShuffle: () => setShuffle(value => !value),
      cycleRepeat: () =>
        setRepeat(value => (value === 'off' ? 'all' : value === 'all' ? 'one' : 'off')),
      stop,
    }),
    [
      track,
      playlist,
      isPlaying,
      position,
      duration,
      volume,
      muted,
      shuffle,
      repeat,
      play,
      toggle,
      pause,
      seek,
      skip,
      setVolume,
      toggleMute,
      stop,
    ],
  );

  return (
    <PlayerContext value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={event => setPosition(event.currentTarget.currentTime)}
        onDurationChange={event => setDuration(event.currentTarget.duration || 0)}
        onVolumeChange={event => setMuted(event.currentTarget.muted)}
        onEnded={onEnded}
      />
    </PlayerContext>
  );
}

export function usePlayer(): PlayerValue {
  const value = use(PlayerContext);
  if (!value) throw new Error('usePlayer must be used inside PlayerProvider');
  return value;
}

function clampVolume(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}
