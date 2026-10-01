import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react';

import { useKeyBindings } from '@/lib/keys';

export interface PanZoomView {
  scale: number;
  x: number;
  y: number;
}

const FIT_VIEW: PanZoomView = { scale: 1, x: 0, y: 0 };

const MIN_SCALE = 0.25;
const MAX_SCALE = 12;
/** A mouse notch (100px) zooms by about a quarter; a trackpad pinch's small deltas zoom smoothly. */
const WHEEL_ZOOM_DIVISOR = 400;
/** Wheel travel that counts as "next", and the pause before another: one notch, one step. */
const WHEEL_STEP_DELTA = 60;
const WHEEL_STEP_COOLDOWN_MS = 350;
const SWIPE_MIN_PX = 60;
/** How much of the picture has to stay on screen however far it is dragged. */
const KEEP_VISIBLE_PX = 96;
const KEY_PAN_PX = 120;

function isFitView(view: PanZoomView): boolean {
  return view.scale === 1 && view.x === 0 && view.y === 0;
}

/**
 * Zoom and pan for a picture on a stage, shared by the image and comic viewers.
 *
 * - Ctrl/⌘ + wheel, a trackpad pinch or a two-finger pinch zooms around the pointer.
 * - Once off fit (zoomed in or out) the picture drags, the wheel and the arrow keys
 *   move it, and it cannot be lost off screen.
 * - At fit the wheel steps (`onWheelStep`) and a horizontal swipe reports its
 *   direction (`onSwipe`), so a gallery or a book can turn.
 *
 * The wheel listener is registered directly and not passive: only then can it
 * stop Ctrl + wheel from zooming the whole page instead of the picture.
 */
export function usePanZoom({
  stageRef,
  contentRef,
  enabled = true,
  quarterTurns = 0,
  onWheelStep,
  onSwipe,
}: {
  stageRef: RefObject<HTMLElement | null>;
  /** The picture's untransformed box, for keeping it on screen. */
  contentRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
  /** Rotation in quarter turns; an odd count swaps width and height. */
  quarterTurns?: number;
  onWheelStep?: (direction: 1 | -1) => void;
  /** `left` means the finger moved left. */
  onSwipe?: (side: 'left' | 'right') => void;
}) {
  const [view, setView] = useState<PanZoomView>(FIT_VIEW);
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const wheel = useRef({ travel: 0, at: 0 });
  const latest = useRef({ view, enabled, onWheelStep, onSwipe, quarterTurns });
  latest.current = { view, enabled, onWheelStep, onSwipe, quarterTurns };

  const clamp = useCallback(
    (next: PanZoomView): PanZoomView => {
      const stage = stageRef.current;
      const content = contentRef.current;
      if (!stage || !content) return next;
      const swap = latest.current.quarterTurns % 2 !== 0;
      const width = (swap ? content.offsetHeight : content.offsetWidth) * next.scale;
      const height = (swap ? content.offsetWidth : content.offsetHeight) * next.scale;
      const limitX = Math.max(
        0,
        (stage.clientWidth + width) / 2 - Math.min(KEEP_VISIBLE_PX, width),
      );
      const limitY = Math.max(
        0,
        (stage.clientHeight + height) / 2 - Math.min(KEEP_VISIBLE_PX, height),
      );
      return {
        scale: next.scale,
        x: Math.max(-limitX, Math.min(limitX, next.x)),
        y: Math.max(-limitY, Math.min(limitY, next.y)),
      };
    },
    [stageRef, contentRef],
  );

  /** Zoom by `factor` keeping the point under (clientX, clientY) still. */
  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      setView(previous => {
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, previous.scale * factor));
        // Zooming back to about the original size lands on fit, not a hair off-centre.
        if (Math.abs(scale - 1) < 0.03 && previous.scale !== 1) return FIT_VIEW;
        const rect = stageRef.current?.getBoundingClientRect();
        if (!rect || clientX === undefined || clientY === undefined) {
          return clamp({ ...previous, scale });
        }
        const offsetX = clientX - (rect.left + rect.width / 2);
        const offsetY = clientY - (rect.top + rect.height / 2);
        const ratio = scale / previous.scale;
        return clamp({
          scale,
          x: offsetX - (offsetX - previous.x) * ratio,
          y: offsetY - (offsetY - previous.y) * ratio,
        });
      });
    },
    [stageRef, clamp],
  );

  const panBy = useCallback(
    (dx: number, dy: number) =>
      setView(previous => clamp({ ...previous, x: previous.x + dx, y: previous.y + dy })),
    [clamp],
  );

  const reset = useCallback(() => setView(FIT_VIEW), []);

  const onWheel = useCallback(
    (event: WheelEvent) => {
      const { enabled, view, onWheelStep } = latest.current;
      if (!enabled) return;
      event.preventDefault();
      const stage = event.currentTarget as HTMLElement;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1;
      const dx = event.deltaX * unit;
      const dy = event.deltaY * unit;
      if (event.ctrlKey || event.metaKey) {
        zoomAt(Math.exp(-dy / WHEEL_ZOOM_DIVISOR), event.clientX, event.clientY);
        return;
      }
      if (!isFitView(view)) {
        // Shift + wheel is the conventional horizontal scroll.
        if (event.shiftKey) panBy(-dy, 0);
        else panBy(-dx, -dy);
        return;
      }
      if (!onWheelStep) return;
      const state = wheel.current;
      const now = performance.now();
      if (now - state.at < WHEEL_STEP_COOLDOWN_MS) return;
      state.travel += dy;
      if (Math.abs(state.travel) >= WHEEL_STEP_DELTA) {
        onWheelStep(state.travel > 0 ? 1 : -1);
        state.travel = 0;
        state.at = now;
      }
    },
    [zoomAt, panBy],
  );

  // The stage can appear after the first render (a comic shows a spinner while
  // it opens), so the listener follows whichever element the ref holds.
  const attached = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const stage = stageRef.current;
    if (stage === attached.current) return;
    attached.current?.removeEventListener('wheel', onWheel);
    stage?.addEventListener('wheel', onWheel, { passive: false });
    attached.current = stage;
  });
  useEffect(
    () => () => {
      attached.current?.removeEventListener('wheel', onWheel);
      attached.current = null;
    },
    [onWheel],
  );

  // Capture, so a zoomed picture gets the arrows before the gallery does; at fit
  // they fall through to it.
  const zoomed = enabled && !isFitView(view);
  useKeyBindings(
    [
      { key: ['+', '='], ctrl: false, when: enabled, run: () => zoomAt(1.25) },
      { key: '-', ctrl: false, when: enabled, run: () => zoomAt(0.8) },
      { key: '0', ctrl: false, when: enabled, run: reset },
      { key: 'ArrowLeft', ctrl: false, when: zoomed, run: () => panBy(KEY_PAN_PX, 0) },
      { key: 'ArrowRight', ctrl: false, when: zoomed, run: () => panBy(-KEY_PAN_PX, 0) },
      { key: 'ArrowUp', ctrl: false, when: zoomed, run: () => panBy(0, KEY_PAN_PX) },
      { key: 'ArrowDown', ctrl: false, when: zoomed, run: () => panBy(0, -KEY_PAN_PX) },
    ],
    { capture: true },
  );

  const handlers = {
    onPointerDown(event: PointerEvent) {
      if (!enabled) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size === 1) swipeStart.current = { x: event.clientX, y: event.clientY };
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinchDistance.current = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        swipeStart.current = null;
      }
    },
    onPointerMove(event: PointerEvent) {
      const previous = pointers.current.get(event.pointerId);
      if (!previous) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size === 2 && pinchDistance.current) {
        const [a, b] = [...pointers.current.values()];
        const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        zoomAt(distance / pinchDistance.current, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
        pinchDistance.current = distance;
        setDragging(true);
      } else if (!isFitView(view)) {
        panBy(event.clientX - previous.x, event.clientY - previous.y);
        setDragging(true);
      }
    },
    onPointerUp(event: PointerEvent) {
      const start = swipeStart.current;
      pointers.current.delete(event.pointerId);
      if (pointers.current.size < 2) pinchDistance.current = null;
      if (pointers.current.size === 0) {
        setDragging(false);
        swipeStart.current = null;
        if (start && isFitView(view) && onSwipe) {
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 2) {
            onSwipe(dx < 0 ? 'left' : 'right');
          }
        }
      }
    },
    onPointerCancel(event: PointerEvent) {
      pointers.current.delete(event.pointerId);
      pinchDistance.current = null;
      swipeStart.current = null;
      if (pointers.current.size === 0) setDragging(false);
    },
    onDoubleClick(event: MouseEvent) {
      if (!enabled) return;
      if (isFitView(view)) zoomAt(2.5, event.clientX, event.clientY);
      else reset();
    },
  };

  return {
    view,
    isFit: isFitView(view),
    dragging,
    zoomAt,
    reset,
    handlers,
    /** Transitions only for steps (buttons, wheel notches), never while a finger drags. */
    transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
    transition: dragging ? 'none' : 'transform 75ms',
  };
}
