import { useCallback, useEffect, useRef, useState } from 'react';
import { isTextSubtitle, type MediaTrack } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';
import { preferredSubtitle, rememberSubtitle } from './tracks';

export type SubtitleStatus = 'ready' | 'loading' | 'failed';

/**
 * The subtitle track of a film: which one is on (the language picked last time
 * until the viewer chooses), whether it has loaded, and its cues kept in step
 * with a converted stream.
 */
export function useSubtitles({
  path,
  probed,
  offset,
  transcoding,
}: {
  path: string;
  probed: readonly MediaTrack[];
  /** Where a converted stream started: its clock reads from there, not from zero. */
  offset: number;
  transcoding: boolean;
}) {
  // Bitmap subtitles (PGS, VobSub) have no WebVTT form; offering them would only fail.
  const tracks = probed.filter(track => isTextSubtitle(track.codec));
  // Undefined until the viewer picks: the language chosen last time applies.
  const [choice, setChoice] = useState<number | null | undefined>(undefined);
  const selected = choice !== undefined ? choice : preferredSubtitle(tracks);

  const trackRef = useRef<HTMLTrackElement | null>(null);
  const cueTimes = useRef(new WeakMap<TextTrackCue, [number, number]>());
  // Which track last finished loading; any other selected one is still on its way.
  const [loaded, setLoaded] = useState<{ index: number; failed: boolean } | null>(null);
  const status: SubtitleStatus =
    selected === null
      ? 'ready'
      : loaded?.index !== selected
        ? 'loading'
        : loaded.failed
          ? 'failed'
          : 'ready';

  // Cues are timed from the start of the film, but a converted stream restarts
  // its clock at the point it was started from; shift them to match.
  const alignCues = useCallback(() => {
    const cues = trackRef.current?.track.cues;
    if (!cues) return;
    const shift = transcoding ? offset : 0;
    for (const cue of Array.from(cues)) {
      let original = cueTimes.current.get(cue);
      if (!original) {
        original = [cue.startTime, cue.endTime];
        cueTimes.current.set(cue, original);
      }
      cue.startTime = original[0] - shift;
      cue.endTime = original[1] - shift;
    }
  }, [transcoding, offset]);
  useEffect(alignCues, [alignCues]);

  // React does not wire load/error on <track>, so listen natively. A track that
  // finished before the listener was attached is caught by its readyState.
  useEffect(() => {
    const element = trackRef.current;
    if (!element || selected === null) return;
    const onLoad = () => {
      setLoaded({ index: selected, failed: false });
      alignCues();
    };
    const onError = () => setLoaded({ index: selected, failed: true });
    if (element.readyState === HTMLTrackElement.LOADED) onLoad();
    else if (element.readyState === HTMLTrackElement.ERROR) onError();
    element.addEventListener('load', onLoad);
    element.addEventListener('error', onError);
    return () => {
      element.removeEventListener('load', onLoad);
      element.removeEventListener('error', onError);
    };
  }, [selected, alignCues]);

  return {
    tracks,
    selected,
    status,
    choose: (index: number | null) => {
      rememberSubtitle(tracks.find(track => track.index === index));
      setChoice(index);
    },
    /** Spread onto the <track> element (keyed by `selected`); null when subtitles are off. */
    trackProps:
      selected === null ? null : { ref: trackRef, src: mediaUrls.subtitle(path, selected) },
  };
}
