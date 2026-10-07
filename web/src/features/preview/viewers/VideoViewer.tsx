import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';

import { api } from '@/lib/api';
import { useKeyBindings } from '@/lib/keys';
import { Centered, Notice, Spinner } from '@/ui/Feedback';
import { usePlayer } from '../audio/PlayerProvider';
import { useMediaSession } from '../audio/useMediaSession';
import { useOverlay, type ViewerProps } from '../overlay';
import { useIdle, ViewerFrame } from '../ViewerFrame';
import { usePlaybackState, useResume, useVideoSource, useVolume } from './video/playback';
import { useSubtitles } from './video/useSubtitles';
import { VideoControls } from './video/VideoControls';

const CONVERSION_FAILED =
  'The video could not be converted for this browser. Check that ffmpeg is installed on the server, or download the file.';

export default function VideoViewer({ entry }: ViewerProps) {
  const path = entry.path;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { step, index, total, toggleFullscreen } = useOverlay();
  const { pause: pauseMusic } = usePlayer();
  const idle = useIdle(true);

  const [rate, setRate] = useState(1);
  const [failure, setFailure] = useState<string | null>(null);
  const { state, events, stopWaiting } = usePlaybackState();
  const { volume, muted, setMuted, applyVolume, toggleMute } = useVolume(videoRef);

  const { data: probe, isPending: probing } = useQuery({
    queryKey: ['probe', path],
    queryFn: ({ signal }) => api.probe(path, signal),
    staleTime: Infinity,
    retry: false,
  });
  const video = useVideoSource(path, probe);
  const { transcoding, restartAt } = video;

  useEffect(() => pauseMusic(), [pauseMusic]);

  const subtitles = useSubtitles({
    path,
    probed: probe?.subtitleTracks ?? [],
    offset: video.offset,
    transcoding: video.transcoding,
  });

  const duration = probe?.durationSeconds ?? state.duration;
  const position = video.offset + state.time;
  const takeResume = useResume(path, position, duration);

  const seek = useCallback(
    (seconds: number) => {
      const target = Math.max(0, Math.min(duration || seconds, seconds));
      if (transcoding) restartAt(target);
      else if (videoRef.current) videoRef.current.currentTime = target;
    },
    [transcoding, restartAt, duration],
  );

  const toggle = useCallback(() => {
    const element = videoRef.current;
    if (!element) return;
    if (element.paused) void element.play().catch(() => undefined);
    else element.pause();
  }, []);

  useKeyBindings(
    (
      [
        [[' ', 'k'], toggle],
        ['ArrowLeft', () => seek(position - 10)],
        ['ArrowRight', () => seek(position + 10)],
        ['ArrowUp', () => applyVolume(volume + 0.1)],
        ['ArrowDown', () => applyVolume(volume - 0.1)],
        ['m', toggleMute],
        ['f', toggleFullscreen],
        ['n', () => step(1)],
        ['p', () => step(-1)],
      ] as const
    ).map(([key, run]) => ({ key, ctrl: false, run })),
  );

  useMediaSession(true, {
    title: entry.name,
    artworkPath: path,
    isPlaying: state.playing,
    position,
    duration,
    onPlay: toggle,
    onPause: () => videoRef.current?.pause(),
    onSeek: seek,
    onPrevious: total > 1 ? () => step(-1) : undefined,
    onNext: total > 1 ? () => step(1) : undefined,
  });

  const { onPointerDown, onStagePointerUp, isMouse } = useTouchSeek(seek, position);

  return (
    <ViewerFrame entry={entry} immersive className="bg-black">
      <div className="absolute inset-0" onPointerUp={onStagePointerUp}>
        {!probing ? (
          <video
            ref={videoRef}
            key={video.source}
            src={video.source}
            autoPlay
            playsInline
            className="size-full"
            {...events}
            onPointerDown={onPointerDown}
            onClick={() => isMouse() && toggle()}
            onLoadedMetadata={event => {
              const element = event.currentTarget;
              element.volume = volume;
              element.playbackRate = rate;
              const at = takeResume(duration || element.duration);
              if (at !== null) seek(at);
            }}
            onVolumeChange={event => setMuted(event.currentTarget.muted)}
            onEnded={() => total > 1 && index < total - 1 && step(1)}
            onError={() => {
              stopWaiting();
              if (!video.transcoding) video.convertFrom(position);
              else setFailure(CONVERSION_FAILED);
            }}
          >
            {subtitles.trackProps ? (
              <track key={subtitles.selected} kind="subtitles" default {...subtitles.trackProps} />
            ) : null}
          </video>
        ) : null}

        <StageNotice failure={failure} waiting={state.waiting} transcoding={video.transcoding} />
      </div>

      <VideoControls
        hidden={idle && state.playing}
        position={position}
        duration={duration}
        buffered={video.offset + state.buffered}
        onSeek={seek}
        playing={state.playing}
        onToggle={toggle}
        onStep={step}
        canStep={total > 1}
        muted={muted}
        volume={volume}
        onVolume={applyVolume}
        onToggleMute={toggleMute}
        audio={{
          tracks: video.audioTracks,
          selected: video.audioTrack,
          onSelect: track => {
            if (track === null || track === video.audioTrack) return;
            video.chooseAudio(track, position);
          },
        }}
        subtitles={{
          tracks: subtitles.tracks,
          selected: subtitles.selected,
          onSelect: subtitles.choose,
        }}
        rate={rate}
        onRate={option => {
          setRate(option);
          if (videoRef.current) videoRef.current.playbackRate = option;
        }}
        onPictureInPicture={pictureInPicture(videoRef)}
        note={noteFor(subtitles.status, video.transcoding)}
      />
    </ViewerFrame>
  );
}

/** Over the picture: why it cannot play, or a spinner while it waits for data. */
function StageNotice({
  failure,
  waiting,
  transcoding,
}: {
  failure: string | null;
  waiting: boolean;
  transcoding: boolean;
}) {
  if (failure) {
    return (
      <Notice
        className="absolute inset-0 bg-stage"
        icon={<TriangleAlert />}
        title="This video cannot be played here"
        body={failure}
      />
    );
  }
  if (!waiting) return null;
  return (
    <Centered className="pointer-events-none absolute inset-0 flex-col gap-3">
      <Spinner className="size-8" />
      {transcoding ? (
        <p className="animate-appear px-6 text-center text-[13px] text-stage-ink/70">
          Converting for this browser. The first seconds take a moment.
        </p>
      ) : null}
    </Centered>
  );
}

/**
 * Touch: a double tap on the left or right third skips 10 seconds. A mouse
 * click on the picture plays or pauses instead, so the element remembers
 * which kind of pointer pressed it.
 */
function useTouchSeek(seek: (seconds: number) => void, position: number) {
  const lastTap = useRef(0);
  const pointerType = useRef('mouse');

  return {
    onPointerDown: (event: PointerEvent<HTMLVideoElement>) => {
      pointerType.current = event.pointerType;
    },
    isMouse: () => pointerType.current === 'mouse',
    onStagePointerUp: (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse') return;
      const now = Date.now();
      const rect = event.currentTarget.getBoundingClientRect();
      const zone = (event.clientX - rect.left) / rect.width;
      const doubleTap = now - lastTap.current < 300;
      if (doubleTap && zone < 0.35) seek(position - 10);
      else if (doubleTap && zone > 0.65) seek(position + 10);
      lastTap.current = now;
    },
  };
}

function pictureInPicture(videoRef: { current: HTMLVideoElement | null }): (() => void) | null {
  if (!document.pictureInPictureEnabled) return null;
  return () =>
    document.pictureInPictureElement
      ? void document.exitPictureInPicture()
      : void videoRef.current?.requestPictureInPicture().catch(() => undefined);
}

function noteFor(subtitleStatus: string, transcoding: boolean): string | null {
  if (subtitleStatus === 'loading') {
    return 'Loading subtitles. The first time reads the whole file, so a long film takes a while.';
  }
  if (subtitleStatus === 'failed') return 'These subtitles could not be read.';
  if (transcoding) return 'Converted on the fly for this browser; seeking restarts the stream.';
  return null;
}
