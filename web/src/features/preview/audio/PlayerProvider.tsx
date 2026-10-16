import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import type { FileEntry } from '@hearth/shared';

import { local } from '@/lib/storage';
import { percentOf, useProgress } from '@/features/progress/progress';
import { canSkipFrom, nowPlaying, playingSpan, useAlbumPlayback, type Album } from './album';
import { useAudioSource } from './source';
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
  /** The file is an album ripped to one file: its tracks, and which is playing. */
  album: Album | null;
  /** Something to go back or on to: another file, or another track of the album. */
  canSkip: boolean;
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

/**
 * Audio lives here, above the preview overlay, so closing the preview that
 * started a track does not unmount the element and stop the music.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<FileEntry | null>(null);
  const [playlist, setPlaylist] = useState<FileEntry[]>([]);
  const [isPlaying, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(() => clampVolume(Number(local.get(VOLUME_KEY) ?? 1)));
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const { save } = useProgress();
  const lastSaved = useRef(0);
  const source = useAudioSource(audioRef, track);
  const { position, duration, seek } = source;

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

  const { album, skipWithin } = useAlbumPlayback({
    file: track,
    position,
    duration,
    repeat,
    shuffle,
    seek,
  });

  const skipFile = useCallback(
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
  const skip = useCallback(
    (delta: number) => {
      if (!skipWithin(delta)) skipFile(delta);
    },
    [skipWithin, skipFile],
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
    lastSaved.current = 0;
    if (audioRef.current) audioRef.current.volume = volume;
    // A new track starts at the volume set; later changes go through setVolume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.path]);
  useTrackProgress(track, position, duration, lastSaved);

  const onEnded = () => {
    if (track)
      save(track.path, { kind: 'time', at: 0, total: duration, percent: 100, savedAt: Date.now() });
    if (repeat === 'one') {
      seek(playingSpan(album, duration).start);
      void audioRef.current?.play().catch(() => undefined);
      return;
    }
    const isLast = playlist.findIndex(item => item.path === track?.path) === playlist.length - 1;
    if (repeat === 'all' || shuffle || !isLast) skipFile(1);
  };

  const canSkip = canSkipFrom(playlist, track, album);
  useMediaSession(track !== null, {
    ...nowPlaying(track, album),
    artworkPath: track?.path ?? '',
    isPlaying,
    position,
    duration,
    onPlay: toggle,
    onPause: pause,
    onSeek: seek,
    onPrevious: canSkip ? () => skip(-1) : undefined,
    onNext: canSkip ? () => skip(1) : undefined,
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
      album,
      canSkip,
      play,
      toggle,
      pause,
      seek,
      skip,
      setVolume,
      toggleMute,
      toggleShuffle: () => setShuffle(value => !value),
      cycleRepeat: () => setRepeat(nextRepeat),
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
      album,
      canSkip,
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
        {...source.events}
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

const REPEAT_ORDER: RepeatMode[] = ['off', 'all', 'one'];

function nextRepeat(mode: RepeatMode): RepeatMode {
  return REPEAT_ORDER[(REPEAT_ORDER.indexOf(mode) + 1) % REPEAT_ORDER.length]!;
}

/** Written from here, not the viewer, because playback outlives the viewer. */
function useTrackProgress(
  track: FileEntry | null,
  position: number,
  duration: number,
  lastSaved: MutableRefObject<number>,
) {
  const { save } = useProgress();
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
  }, [track, position, duration, save, lastSaved]);
}
