import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ListVideo } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Spinner, Tooltip } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { api, mediaUrls } from '@/lib/api';
import { ViewerChrome } from '../ViewerChrome';
import { VideoControls } from './video/VideoControls';
import { VideoRateMenu, VideoTrackMenu } from './video/VideoTrackMenu';
import { useVideoPlayback } from './video/useVideoPlayback';
import { useVideoResume } from './video/useVideoResume';
import { useVideoGestures } from './video/useVideoGestures';
import { useMediaSession } from './video/useMediaSession';
import { VideoOsd } from './video/VideoOsd';
import { VideoPlaylist } from './video/VideoPlaylist';
import { usePlayback } from '../PlaybackProvider';
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
  const isBackground = chrome.isBackground;

  // Background music does not survive a video opening: two soundtracks at once
  // is never what was meant, and the dock leaves the track a tap from resuming.
  const { pause: pauseBackgroundAudio } = usePlayback();
  useEffect(() => {
    pauseBackgroundAudio();
  }, [pauseBackgroundAudio]);
  const resume = useVideoResume(path);
  const [playlistOpen, setPlaylistOpen] = useState(false);

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
      const target =
        (needsTranscode ? transcodeOffset : 0) + playback.state.positionSeconds + delta;
      seek(Math.max(0, target));
    },
    [needsTranscode, transcodeOffset, playback.state.positionSeconds, seek],
  );

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY_MS);
  }, []);

  /** True position in the file, which a transcode reports relative to its start. */
  const absolutePosition = playback.state.positionSeconds + transcodeOffset;
  const totalDuration = probe?.durationSeconds ?? playback.state.durationSeconds;

  // Restore the saved position once metadata reports the duration.
  const handleLoadedMetadata = useCallback(() => {
    if (needsTranscode) return;
    const at = resume.resumeAt(playback.state.durationSeconds || totalDuration);
    if (at > 0) playback.seek(at);
  }, [needsTranscode, resume, playback, totalDuration]);

  useEffect(() => {
    resume.save(absolutePosition, totalDuration);
  }, [absolutePosition, totalDuration, resume]);

  // Enabled for every pointer type: a mouse drag scrubs too, which is the only
  // way to seek without aiming at a 4px bar.
  const gestures = useVideoGestures(true, {
    positionSeconds: () => absolutePosition,
    durationSeconds: () => totalDuration,
    volume: () => playback.state.volume,
    onSeek: seek,
    onVolume: playback.setVolume,
    onToggle: playback.toggle,
  });

  const galleryIndex = item.gallery.findIndex(entry => entry.path === path);
  const hasPlaylist = item.gallery.length > 1;

  useMediaSession(!isBackground, {
    title: item.entry.name,
    path,
    isPlaying: playback.state.isPlaying,
    positionSeconds: absolutePosition,
    durationSeconds: totalDuration,
    onPlay: playback.toggle,
    onPause: playback.toggle,
    onSeek: seek,
    onSeekBy: seekBy,
    onPrevious: hasPlaylist && galleryIndex > 0 ? () => onStep(-1) : undefined,
    onNext: hasPlaylist && galleryIndex < item.gallery.length - 1 ? () => onStep(1) : undefined,
  });

  /**
   * With no window left, the picture moves to the browser's own floating one.
   *
   * This viewer stays mounted only because that window dies with its element, so
   * the two are the same lifetime: if the request is refused there is nothing to
   * keep alive and the preview ends, and when the window is dismissed it ends too.
   */
  useEffect(() => {
    if (!isBackground) return;
    const video = playback.videoRef.current;
    if (!video) return;

    let cancelled = false;
    const onLeave = () => {
      if (!cancelled) chrome.onClose();
    };
    video.addEventListener('leavepictureinpicture', onLeave);

    void video.requestPictureInPicture().catch(() => {
      if (!cancelled) chrome.onClose();
    });

    return () => {
      cancelled = true;
      video.removeEventListener('leavepictureinpicture', onLeave);
    };
    // Entering happens once, when the window is taken away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBackground]);

  useEffect(() => {
    if (isBackground) return;
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
        // The window owns fullness now, so F does what the header's control
        // does — one mechanism, one state, whichever of the two you reach for.
        f: chrome.onToggleFull,
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
  }, [playback, seekBy, revealControls, chrome.onToggleFull, isBackground]);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  return (
    <ViewerChrome
      item={item}
      onStep={onStep}
      // The transport carries previous/next file, next to the seek buttons.
      galleryArrows="none"
      contentClassName="group/viewer bg-black"
      controls={
        hasPlaylist ? (
          <Tooltip label="Up next">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPlaylistOpen(open => !open)}
              aria-pressed={playlistOpen}
              aria-label="Up next"
              className={cn(playlistOpen && 'text-accent')}
            >
              <ListVideo className="h-4 w-4" />
            </Button>
          </Tooltip>
        ) : undefined
      }
      {...chrome}
    >
      <div className="flex h-full w-full min-w-0">
        <div
          ref={containerRef}
          className="relative flex h-full min-w-0 flex-1 items-center justify-center"
          onPointerLeave={() => setControlsVisible(false)}
          {...gestures.handlers}
          // Composed rather than spread over: the gesture handler and the
          // control-reveal both want `pointermove`, and the spread would
          // silently drop whichever was written first.
          onPointerMove={event => {
            revealControls();
            gestures.handlers.onPointerMove?.(event);
          }}
          // A scrub that ends over the picture would otherwise land as a click
          // and toggle the chrome you were just using.
          onClickCapture={event => {
            if (!gestures.draggedRef.current) return;
            gestures.draggedRef.current = false;
            event.stopPropagation();
          }}
        >
          {isPending ? (
            <Spinner className="h-6 w-6" />
          ) : (
            <video
              ref={playback.videoRef}
              key={source}
              src={source}
              className="h-full w-full"
              style={{ filter: `brightness(${gestures.brightness})` }}
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

          <VideoOsd osd={gestures.osd} />

          {playback.state.isWaiting ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Spinner className="h-8 w-8" />
            </div>
          ) : null}

          <VideoControls
            state={{
              ...playback.state,
              // A transcode reports time from its own start, so the offset is
              // added back to show the true position within the file. Buffered
              // is on the same clock and needs the same shift — without it the
              // buffered bar sits at zero while the played bar is halfway
              // across, which reads as a broken scrubber.
              positionSeconds: playback.state.positionSeconds + transcodeOffset,
              bufferedSeconds: playback.state.bufferedSeconds + transcodeOffset,
              durationSeconds: probe?.durationSeconds ?? playback.state.durationSeconds,
            }}
            visible={controlsVisible || !playback.state.isPlaying}
            onToggle={playback.toggle}
            onSeek={seek}
            onSeekBy={seekBy}
            onStepFile={hasPlaylist ? onStep : undefined}
            onVolume={playback.setVolume}
            onToggleMute={playback.toggleMute}
            isFull={chrome.isFull}
            onFullscreen={chrome.onToggleFull}
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

        {playlistOpen && hasPlaylist ? (
          <VideoPlaylist
            items={item.gallery}
            currentPath={path}
            onSelect={entry => {
              const target = item.gallery.findIndex(candidate => candidate.path === entry.path);
              if (target >= 0 && target !== galleryIndex) onStep(target - galleryIndex);
              setPlaylistOpen(false);
            }}
            onClose={() => setPlaylistOpen(false)}
          />
        ) : null}
      </div>
    </ViewerChrome>
  );
}
