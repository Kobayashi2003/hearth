import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Spinner } from '@/components/ui/primitives';
import { api, mediaUrls } from '@/lib/api';
import { ViewerChrome } from '../ViewerChrome';
import { VideoControls } from './video/VideoControls';
import { VideoRateMenu, VideoTrackMenu } from './video/VideoTrackMenu';
import { useResumePosition } from './video/useResumePosition';
import { useVideoPlayback } from './video/useVideoPlayback';
import type { ViewerProps } from './types';

const CONTROLS_HIDE_DELAY_MS = 2600;

/**
 * Video playback. Files the browser can decode are streamed raw so seeking uses
 * HTTP Range with nothing in the byte path; anything else falls back to an
 * on-the-fly transcode, where seeking means restarting the encode at an offset.
 */
export default function VideoViewer({ item, onStep, ...chrome }: ViewerProps) {
  const path = item.entry.path;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playback = useVideoPlayback();
  const resume = useResumePosition(path);

  const [audioTrack, setAudioTrack] = useState(0);
  const [subtitleTrack, setSubtitleTrack] = useState<number | null>(null);
  const [transcodeOffset, setTranscodeOffset] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<number | undefined>(undefined);

  const { data: probe, isPending } = useQuery({
    queryKey: ['probe', path],
    queryFn: ({ signal }) => api.probe(path, signal),
    staleTime: Infinity,
  });

  // A transcode is also required when the wanted audio track is not the first,
  // because a raw stream carries whatever the container's default is.
  const needsTranscode = probe ? !probe.browserPlayable || audioTrack > 0 : false;

  const source = needsTranscode
    ? mediaUrls.transcode(path, { audioTrack, start: transcodeOffset })
    : mediaUrls.raw(path);

  /** A transcoded stream is not byte-seekable; seeking re-encodes from the offset. */
  const seek = useCallback(
    (seconds: number) => {
      if (needsTranscode) setTranscodeOffset(seconds);
      else playback.seek(seconds);
    },
    [needsTranscode, playback],
  );

  const seekBy = useCallback(
    (delta: number) => {
      const target = (needsTranscode ? transcodeOffset : 0) + playback.state.positionSeconds + delta;
      seek(Math.max(0, target));
    },
    [needsTranscode, transcodeOffset, playback.state.positionSeconds, seek],
  );

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY_MS);
  }, []);

  // Restore the saved position once metadata reports the duration.
  const handleLoadedMetadata = useCallback(() => {
    if (needsTranscode) return;
    const saved = resume.savedPosition();
    if (saved > 0) playback.seek(saved);
  }, [needsTranscode, resume, playback]);

  useEffect(() => {
    resume.save(playback.state.positionSeconds, playback.state.durationSeconds);
  }, [playback.state.positionSeconds, playback.state.durationSeconds, resume]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;
      const actions: Record<string, () => void> = {
        ' ': playback.toggle,
        k: playback.toggle,
        ArrowLeft: () => seekBy(-10),
        ArrowRight: () => seekBy(10),
        ArrowUp: () => playback.setVolume(playback.state.volume + 0.1),
        ArrowDown: () => playback.setVolume(playback.state.volume - 0.1),
        m: playback.toggleMute,
        f: () => void playback.toggleFullscreen(containerRef.current),
      };
      const action = actions[event.key];
      if (action) {
        event.preventDefault();
        revealControls();
        action();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playback, seekBy, revealControls]);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  return (
    <ViewerChrome
      item={item}
      onStep={onStep}
      contentClassName="group/viewer bg-black"
      {...chrome}
    >
      <div
        ref={containerRef}
        className="relative flex h-full w-full items-center justify-center"
        onPointerMove={revealControls}
        onPointerLeave={() => setControlsVisible(false)}
      >
        {isPending ? (
          <Spinner className="h-6 w-6" />
        ) : (
          <video
            ref={playback.videoRef}
            key={source}
            src={source}
            className="h-full w-full"
            playsInline
            autoPlay
            onClick={playback.toggle}
            onLoadedMetadata={handleLoadedMetadata}
            {...playback.handlers}
          >
            {subtitleTrack !== null ? (
              <track
                kind="subtitles"
                src={mediaUrls.subtitle(path, subtitleTrack)}
                label="Subtitles"
                default
              />
            ) : null}
          </video>
        )}

        {playback.state.isWaiting ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Spinner className="h-8 w-8" />
          </div>
        ) : null}

        <VideoControls
          state={{
            ...playback.state,
            // A transcode reports time from its own start, so the offset is
            // added back to show the true position within the file.
            positionSeconds: playback.state.positionSeconds + transcodeOffset,
            durationSeconds: probe?.durationSeconds ?? playback.state.durationSeconds,
          }}
          visible={controlsVisible || !playback.state.isPlaying}
          onToggle={playback.toggle}
          onSeek={seek}
          onSeekBy={seekBy}
          onVolume={playback.setVolume}
          onToggleMute={playback.toggleMute}
          onFullscreen={() => void playback.toggleFullscreen(containerRef.current)}
          onPictureInPicture={() => void playback.togglePictureInPicture()}
          extras={
            <>
              <VideoTrackMenu
                audioTracks={probe?.audioTracks ?? []}
                subtitleTracks={probe?.subtitleTracks ?? []}
                activeAudioTrack={audioTrack}
                activeSubtitleTrack={subtitleTrack}
                onSelectAudio={setAudioTrack}
                onSelectSubtitle={setSubtitleTrack}
              />
              <VideoRateMenu rate={playback.state.rate} onSelect={playback.setRate} />
            </>
          }
        />
      </div>
    </ViewerChrome>
  );
}
