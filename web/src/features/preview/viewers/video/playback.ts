import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type SyntheticEvent,
} from 'react';
import type { MediaProbe } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';
import { local } from '@/lib/storage';
import { percentOf, useProgress } from '@/features/progress/progress';
import { preferredAudio, rememberAudio } from './tracks';

const SAVE_EVERY_SECONDS = 5;
const RESUME_MIN_SECONDS = 30;
const RESUME_END_MARGIN = 20;

type VideoEvent = SyntheticEvent<HTMLVideoElement>;

/** What the element reports as it plays, and the handlers that keep it current. */
export function usePlaybackState() {
  const [state, setState] = useState({
    playing: false,
    time: 0,
    duration: 0,
    buffered: 0,
    waiting: true,
  });

  const events = useMemo(
    () => ({
      onPlay: () => setState(current => ({ ...current, playing: true })),
      onPause: () => setState(current => ({ ...current, playing: false, waiting: false })),
      onWaiting: () => setState(current => ({ ...current, waiting: true })),
      onPlaying: () => setState(current => ({ ...current, waiting: false, playing: true })),
      onCanPlay: () => setState(current => ({ ...current, waiting: false })),
      onDurationChange: (event: VideoEvent) => {
        // Read now: React clears currentTarget before a state updater runs.
        const length = event.currentTarget.duration || 0;
        setState(current => ({ ...current, duration: length }));
      },
      onTimeUpdate: (event: VideoEvent) => {
        const video = event.currentTarget;
        const buffered = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
        setState(current => ({ ...current, time: video.currentTime, buffered }));
      },
    }),
    [],
  );

  const stopWaiting = useCallback(() => setState(current => ({ ...current, waiting: false })), []);
  return { state, events, stopWaiting };
}

/**
 * Where to play from and how: the original file when the browser can decode
 * it, otherwise a conversion that starts at `offset` (a conversion cannot
 * seek, so a seek restarts it there). Choosing another audio track, or the
 * browser refusing the original after all, also switches to a conversion.
 */
export function useVideoSource(path: string, probe: MediaProbe | undefined) {
  // Null until the viewer picks: the language chosen last time applies.
  const [audioChoice, setAudioChoice] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [refused, setRefused] = useState(false);

  const audioTracks = probe?.audioTracks ?? [];
  const audioTrack = audioChoice ?? preferredAudio(audioTracks);
  const transcoding = refused || (probe ? !probe.browserPlayable || audioTrack > 0 : false);
  const source = transcoding
    ? mediaUrls.transcode(path, { audioTrack, start: offset })
    : mediaUrls.raw(path);

  return {
    source,
    transcoding,
    offset,
    restartAt: setOffset,
    audioTracks,
    audioTrack,
    chooseAudio: (track: number, at: number) => {
      rememberAudio(audioTracks.find(candidate => candidate.index === track));
      setOffset(at);
      setAudioChoice(track);
    },
    convertFrom: (at: number) => {
      setOffset(at);
      setRefused(true);
    },
  };
}

/**
 * Picks up where this video was left, and keeps the place as it plays. The
 * saved position is used once, and only away from both ends: a few seconds in
 * is not worth resuming, and the credits are as good as finished.
 */
export function useResume(path: string, position: number, duration: number) {
  const { progressFor, save } = useProgress();
  const resumeAt = useRef<number | null>(null);
  const lastSaved = useRef(0);

  if (resumeAt.current === null) {
    const saved = progressFor(path);
    resumeAt.current = saved?.kind === 'time' && typeof saved.at === 'number' ? saved.at : 0;
  }

  useEffect(() => {
    if (!duration || Math.abs(position - lastSaved.current) < SAVE_EVERY_SECONDS) return;
    lastSaved.current = position;
    const nearEnd = position > duration - RESUME_END_MARGIN;
    save(path, {
      kind: 'time',
      at: nearEnd ? 0 : position,
      total: duration,
      percent: nearEnd ? 100 : percentOf(position, duration),
      savedAt: Date.now(),
    });
  }, [position, duration, path, save]);

  /** The position to seek to now that the video's length is known, or null. */
  return useCallback((length: number): number | null => {
    const at = resumeAt.current ?? 0;
    resumeAt.current = 0;
    return at > RESUME_MIN_SECONDS && at < length - RESUME_END_MARGIN ? at : null;
  }, []);
}

/** Volume kept across videos and visits; muting is the element's own. */
export function useVolume(videoRef: RefObject<HTMLVideoElement | null>) {
  const [volume, setVolume] = useState(() => Number(local.get('hearth.volume') ?? 1));
  const [muted, setMuted] = useState(false);

  const applyVolume = useCallback(
    (next: number) => {
      const clamped = Math.min(1, Math.max(0, next));
      setVolume(clamped);
      local.set('hearth.volume', String(clamped));
      if (videoRef.current) {
        videoRef.current.volume = clamped;
        videoRef.current.muted = false;
      }
    },
    [videoRef],
  );

  const toggleMute = useCallback(() => {
    if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
  }, [videoRef]);

  return { volume, muted, setMuted, applyVolume, toggleMute };
}
