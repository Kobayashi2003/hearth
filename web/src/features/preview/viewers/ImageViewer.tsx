import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import { ImageOff, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';

import { mediaUrls } from '@/lib/api';
import { extensionOf } from '@/lib/format';
import { Button } from '@/ui/Button';
import { Centered, Notice, Spinner } from '@/ui/Feedback';
import { isTypingTarget } from '../PreviewOverlay';
import { usePreview } from '../PreviewProvider';
import { ViewerFrame } from '../ViewerFrame';
import type { ViewerProps } from '../viewers';

interface View {
  scale: number;
  x: number;
  y: number;
  rotation: number;
}

const FIT: View = { scale: 1, x: 0, y: 0, rotation: 0 };
const MIN_SCALE = 0.25;
const MAX_SCALE = 12;

/** Photoshop files have no browser decoder; the server renders a large thumbnail instead. */
function sourceFor(path: string): string {
  return extensionOf(path) === '.psd' ? mediaUrls.thumbnail(path, 2048) : mediaUrls.raw(path);
}

export default function ImageViewer({ entry }: ViewerProps) {
  const { current } = usePreview();
  const [view, setView] = useState<View>(FIT);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);

  /** Zoom by `factor` keeping the point under (clientX, clientY) still. */
  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    setView(previous => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, previous.scale * factor));
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect || clientX === undefined || clientY === undefined) return { ...previous, scale };
      const offsetX = clientX - (rect.left + rect.width / 2);
      const offsetY = clientY - (rect.top + rect.height / 2);
      const ratio = scale / previous.scale;
      return {
        ...previous,
        scale,
        x: offsetX - (offsetX - previous.x) * ratio,
        y: offsetY - (offsetY - previous.y) * ratio,
      };
    });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.key === '+' || event.key === '=') zoomAt(1.25);
      else if (event.key === '-') zoomAt(0.8);
      else if (event.key === '0') setView(FIT);
      else if (event.key.toLowerCase() === 'r')
        setView(previous => ({ ...previous, rotation: previous.rotation + 90 }));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomAt]);

  // Neighbours are fetched ahead so stepping through a folder feels instant.
  useEffect(() => {
    if (!current) return;
    const index = current.gallery.findIndex(item => item.path === entry.path);
    for (const offset of [1, -1, 2]) {
      const neighbour = current.gallery[index + offset];
      if (neighbour) new Image().src = sourceFor(neighbour.path);
    }
  }, [current, entry.path]);

  function onWheel(event: WheelEvent) {
    zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX, event.clientY);
  }

  function onPointerDown(event: PointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), scale: view.scale };
    }
  }

  function onPointerMove(event: PointerEvent) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const scale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, (pinchStart.current.scale * distance) / pinchStart.current.distance),
      );
      setView(current => ({ ...current, scale }));
    } else if (view.scale > 1) {
      setView(current => ({
        ...current,
        x: current.x + event.clientX - previous.x,
        y: current.y + event.clientY - previous.y,
      }));
    }
  }

  function onPointerUp(event: PointerEvent) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
  }

  const zoomed = view.scale !== 1 || view.rotation % 360 !== 0;

  return (
    <ViewerFrame
      entry={entry}
      immersive
      arrows
      actions={
        <>
          <Button
            variant="stage"
            size="icon"
            onClick={() => zoomAt(0.8)}
            aria-label="Zoom out"
            title="Zoom out (−)"
          >
            <ZoomOut />
          </Button>
          <button
            type="button"
            onClick={() => setView(FIT)}
            title="Fit (0)"
            className="tabular h-8 min-w-12 rounded-lg px-1.5 text-[12px] text-stage-ink/80 hover:bg-white/10"
          >
            {zoomed ? `${Math.round(view.scale * 100)}%` : 'Fit'}
          </button>
          <Button
            variant="stage"
            size="icon"
            onClick={() => zoomAt(1.25)}
            aria-label="Zoom in"
            title="Zoom in (+)"
          >
            <ZoomIn />
          </Button>
          <Button
            variant="stage"
            size="icon"
            onClick={() => setView(previous => ({ ...previous, rotation: previous.rotation + 90 }))}
            aria-label="Rotate"
            title="Rotate (R)"
          >
            <RotateCw />
          </Button>
        </>
      }
    >
      <div
        ref={stageRef}
        className="absolute inset-0 touch-none select-none overflow-hidden"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={event => (zoomed ? setView(FIT) : zoomAt(2.5, event.clientX, event.clientY))}
        style={{ cursor: view.scale > 1 ? 'grab' : 'zoom-in' }}
      >
        <img
          src={sourceFor(entry.path)}
          alt={entry.name}
          draggable={false}
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('error')}
          className="absolute inset-0 m-auto max-h-full max-w-full object-contain transition-transform duration-75"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale}) rotate(${view.rotation}deg)`,
            opacity: status === 'ready' ? 1 : 0,
          }}
        />
        {status === 'loading' ? (
          <Centered className="absolute inset-0">
            <Spinner />
          </Centered>
        ) : null}
        {status === 'error' ? (
          <Notice
            className="absolute inset-0"
            icon={<ImageOff />}
            title="This image could not be shown"
            body="The browser cannot decode this format. Download it to open it in another app."
          />
        ) : null}
      </div>
    </ViewerFrame>
  );
}
