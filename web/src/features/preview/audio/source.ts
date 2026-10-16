import { useEffect, useRef, useState, type RefObject, type SyntheticEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FileEntry, Progress } from '@hearth/shared';

import { api, mediaUrls } from '@/lib/api';
import { useProgress } from '@/features/progress/progress';

/** Too little to be worth resuming, or so close to the end that the track is done. */
const RESUME_MIN_SECONDS = 20;
const RESUME_END_MARGIN = 10;

type AudioEvent = SyntheticEvent<HTMLAudioElement>;

/**
 * What the <audio> element plays. The file as it is first; if the browser
 * cannot decode it (APE, WMA…), a conversion from the server instead, which
 * cannot seek, so a seek starts it again from there. Positions and the
 * duration are always the file's own, whichever is playing.
 */
export function useAudioSource(
  audioRef: RefObject<HTMLAudioElement | null>,
  track: FileEntry | null,
) {
  const { progressFor } = useProgress();
  const [conversion, setConversion] = useState<{ path: string; offset: number } | null>(null);
  const [time, setTime] = useState(0);
  const [elementDuration, setElementDuration] = useState(0);
  // A seek in a conversion restarts it; it plays on only if it was playing.
  const playOnLoad = useRef(true);

  const converting = track !== null && conversion?.path === track.path;
  const offset = converting ? conversion.offset : 0;
  const probe = useQuery({
    queryKey: ['probe', track?.path],
    queryFn: ({ signal }) => api.probe(track!.path, signal),
    enabled: converting,
    staleTime: Number.POSITIVE_INFINITY,
  }).data;
  const src = sourceUrl(track, converting, offset);
  const resumeAt = track ? resumePoint(progressFor(track.path)) : 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setTime(0);
    setElementDuration(0);
    if (!src) {
      audio.removeAttribute('src');
      audio.load();
      return;
    }
    audio.src = src;
    // A conversion already starts where it should; the file itself is moved there once it knows its length.
    const onReady = () => {
      if (!converting && resumeAt > 0 && resumeAt < audio.duration - RESUME_END_MARGIN)
        audio.currentTime = resumeAt;
    };
    audio.addEventListener('loadedmetadata', onReady, { once: true });
    if (playOnLoad.current) void audio.play().catch(() => undefined);
    playOnLoad.current = true;
    return () => audio.removeEventListener('loadedmetadata', onReady);
    // Only a new source reloads the element; where to resume is read as it loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const seek = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds) || !track) return;
    const at = Math.max(0, seconds);
    if (!converting) {
      audio.currentTime = at;
      return;
    }
    playOnLoad.current = !audio.paused;
    setConversion({ path: track.path, offset: at });
  };

  const events = {
    onTimeUpdate: (event: AudioEvent) => setTime(event.currentTarget.currentTime),
    onDurationChange: (event: AudioEvent) => {
      const length = event.currentTarget.duration;
      setElementDuration(Number.isFinite(length) ? length : 0);
    },
    onError: (event: AudioEvent) => {
      // Only the file itself is retried as a conversion; a conversion that fails is left failed.
      if (!track || converting || !event.currentTarget.error) return;
      const audio = event.currentTarget;
      setConversion({
        path: track.path,
        offset: audio.readyState > 0 ? audio.currentTime : resumeAt,
      });
    },
  };

  return {
    position: offset + time,
    duration: converting ? (probe?.durationSeconds ?? 0) : elementDuration,
    converting,
    seek,
    events,
  };
}

function sourceUrl(track: FileEntry | null, converting: boolean, offset: number): string | null {
  if (!track) return null;
  return converting ? mediaUrls.audio(track.path, offset) : mediaUrls.raw(track.path);
}

/** Where a track was left, if that is worth going back to. */
function resumePoint(saved: Progress | undefined): number {
  if (saved?.kind !== 'time' || typeof saved.at !== 'number') return 0;
  const nearEnd = saved.total !== undefined && saved.at > saved.total - RESUME_END_MARGIN;
  return saved.at > RESUME_MIN_SECONDS && !nearEnd ? saved.at : 0;
}
