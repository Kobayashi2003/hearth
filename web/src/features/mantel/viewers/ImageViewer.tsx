import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/primitives';
import { mediaUrls } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ViewerChrome } from '../ViewerChrome';
import type { ViewerProps } from './types';

const ZOOM_STEP = 1.25;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 12;

interface Transform {
  zoom: number;
  x: number;
  y: number;
  rotation: number;
}

const FIT: Transform = { zoom: 0, x: 0, y: 0, rotation: 0 };

/**
 * Image viewer with zoom, pan, rotate and fit. `zoom: 0` means "fit to the
 * frame" rather than a specific scale, so resizing the window keeps the image
 * fitted instead of stranding it at a stale ratio.
 */
export default function ImageViewer({ item, onStep, ...chrome }: ViewerProps) {
  const [transform, setTransform] = useState<Transform>(FIT);
  const [isDragging, setDragging] = useState(false);
  const dragOrigin = useRef({ x: 0, y: 0, pointerX: 0, pointerY: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const naturalSize = useRef({ width: 0, height: 0 });

  // A new image starts fitted rather than inheriting the previous one's zoom.
  useEffect(() => setTransform(FIT), [item.entry.path]);

  /**
   * The scale at which the image fits the frame — natural size mapped into the
   * container, never upscaled. `zoom` is measured against natural size (1 =
   * actual pixels), so this is where a zoom out of the fitted state must begin;
   * starting from 1 instead would jump a phone-fitted image up to full size.
   */
  const fitScale = useCallback(() => {
    const container = containerRef.current;
    const { width, height } = naturalSize.current;
    if (!container || !width || !height) return 1;
    return Math.min(1, container.clientWidth / width, container.clientHeight / height);
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      setTransform(current => {
        const base = current.zoom === 0 ? fitScale() : current.zoom;
        return { ...current, zoom: clamp(base * factor, MIN_ZOOM, MAX_ZOOM) };
      });
    },
    [fitScale],
  );

  const rotate = useCallback(() => {
    setTransform(current => ({ ...current, rotation: (current.rotation + 90) % 360 }));
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;
      const actions: Record<string, () => void> = {
        r: rotate,
        '+': () => zoomBy(ZOOM_STEP),
        '=': () => zoomBy(ZOOM_STEP),
        '-': () => zoomBy(1 / ZOOM_STEP),
        '0': () => setTransform(FIT),
        ArrowLeft: () => onStep(-1),
        ArrowRight: () => onStep(1),
      };
      const action = actions[event.key];
      if (action) {
        event.preventDefault();
        action();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [rotate, zoomBy, onStep]);

  function handleWheel(event: React.WheelEvent) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
  }

  function handlePointerDown(event: React.PointerEvent) {
    // Record the start either way: a drag pans a zoomed image, a swipe steps
    // the gallery on a fitted one.
    dragOrigin.current = {
      x: transform.x,
      y: transform.y,
      pointerX: event.clientX,
      pointerY: event.clientY,
    };
    if (transform.zoom === 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (!isDragging) return;
    const origin = dragOrigin.current;
    setTransform(current => ({
      ...current,
      x: origin.x + (event.clientX - origin.pointerX),
      y: origin.y + (event.clientY - origin.pointerY),
    }));
  }

  const SWIPE_THRESHOLD = 60;

  function handlePointerUp(event: React.PointerEvent) {
    setDragging(false);
    // A horizontal swipe over a fitted image steps the gallery — the gesture a
    // phone user reaches for.
    if (transform.zoom !== 0) return;
    const dx = event.clientX - dragOrigin.current.pointerX;
    const dy = event.clientY - dragOrigin.current.pointerY;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      onStep(dx < 0 ? 1 : -1);
    }
  }

  const isFitted = transform.zoom === 0;

  return (
    <ViewerChrome
      item={item}
      onStep={onStep}
      contentClassName="group/viewer bg-hearth-950"
      controls={
        <div className="flex items-center gap-0.5">
          <Tooltip label="Zoom out (−)">
            <Button variant="ghost" size="icon" onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out">
              <ZoomOut className="h-4 w-4" />
            </Button>
          </Tooltip>
          <span className="tabular w-12 text-center text-xs text-muted">
            {isFitted ? 'Fit' : `${Math.round(transform.zoom * 100)}%`}
          </span>
          <Tooltip label="Zoom in (+)">
            <Button variant="ghost" size="icon" onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in">
              <ZoomIn className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip label="Fit to window (0)">
            <Button variant="ghost" size="icon" onClick={() => setTransform(FIT)} aria-label="Fit to window">
              <Maximize2 className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip label="Rotate (R)">
            <Button variant="ghost" size="icon" onClick={rotate} aria-label="Rotate">
              <RotateCw className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      }
      {...chrome}
    >
      <div
        ref={containerRef}
        className={cn(
          'flex h-full w-full items-center justify-center overflow-hidden',
          isFitted ? 'cursor-default' : isDragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={() => setTransform(isFitted ? { ...FIT, zoom: 1 } : FIT)}
      >
        <img
          src={mediaUrls.raw(item.entry.path)}
          alt={item.entry.name}
          draggable={false}
          onLoad={event => {
            naturalSize.current = {
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            };
          }}
          className={cn(
            'select-none',
            isFitted ? 'max-h-full max-w-full object-contain' : 'max-w-none',
          )}
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) rotate(${transform.rotation}deg)${
              isFitted ? '' : ` scale(${transform.zoom})`
            }`,
            transition: isDragging ? 'none' : 'transform var(--duration-quick) var(--ease-out-quick)',
          }}
        />
      </div>
    </ViewerChrome>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
