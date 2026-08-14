import { useEffect, useRef } from 'react';

/**
 * Frequency bars driven by the audio actually playing.
 *
 * The `AudioContext` is a module-level singleton that is never closed. Two
 * reasons, both learned the hard way in the player this is modelled on:
 *
 * 1. `createMediaElementSource` may be called only once per element — a second
 *    call throws, and React StrictMode mounts every effect twice in
 *    development.
 * 2. Routing an element through a context is permanent. Closing the context on
 *    unmount does not hand the audio back to the element; it silences it for
 *    the rest of the session.
 */
const BAR_COUNT = 48;
/** Must be a power of two; 128 bins is plenty for 48 bars. */
const FFT_SIZE = 128;

const graph = (() => {
  let context: AudioContext | null = null;
  const connected = new WeakMap<HTMLMediaElement, AnalyserNode>();

  return {
    analyserFor(element: HTMLMediaElement): AnalyserNode | null {
      try {
        const existing = connected.get(element);
        if (existing) return existing;

        context ??= new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.8;

        const source = context.createMediaElementSource(element);
        source.connect(analyser);
        // Still routed to the speakers: an analyser is a tap, not a sink.
        analyser.connect(context.destination);

        connected.set(element, analyser);
        return analyser;
      } catch {
        // Web Audio unavailable, or the element is cross-origin tainted. The
        // visualiser is decoration; playback must not depend on it.
        return null;
      }
    },
    resume(): void {
      // Browsers start the context suspended until a gesture unlocks it.
      void context?.resume().catch(() => undefined);
    },
  };
})();

export function useVisualiser(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  audio: HTMLAudioElement | null,
  isPlaying: boolean,
  accent: string,
): void {
  const frame = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audio || !isPlaying) return;

    const analyser = graph.analyserFor(audio);
    if (!analyser) return;
    graph.resume();

    const context = canvas.getContext('2d');
    if (!context) return;

    const bins = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      frame.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(bins);

      const { width, height } = canvas;
      context.clearRect(0, 0, width, height);
      context.fillStyle = accent;

      const barWidth = width / BAR_COUNT;
      for (let index = 0; index < BAR_COUNT; index += 1) {
        // The top bins are mostly silence; sampling the lower half spreads the
        // interesting part of the spectrum across the whole width.
        const value = bins[Math.floor((index / BAR_COUNT) * (bins.length * 0.7))] ?? 0;
        const barHeight = Math.max(2, (value / 255) * height);
        context.fillRect(
          index * barWidth + barWidth * 0.15,
          height - barHeight,
          barWidth * 0.7,
          barHeight,
        );
      }
    };

    draw();
    return () => cancelAnimationFrame(frame.current);
  }, [canvasRef, audio, isPlaying, accent]);
}
