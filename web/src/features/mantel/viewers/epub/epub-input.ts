import { turnForSide } from './epub-layout';

/**
 * Page-turning gestures, installed inside each chapter's iframe.
 *
 * They have to live in there. epub.js renders into a frame that covers the
 * whole reading area, so a pointer or wheel listener on the host element never
 * sees an event that lands on the text — which is every event that matters.
 *
 * The vocabulary:
 *
 *   arrow keys                 → turn a page   (forwarded to the host)
 *   wheel                      → turn a page   (the desktop gesture)
 *   ctrl / ⌘ + wheel           → resize text
 *   swipe horizontally         → turn a page   (touch and pen only)
 *   tap or click the outer ¼   → turn a page
 *
 * Swipes are touch-only on purpose: the same drag with a mouse is how text is
 * selected, and a reader that turns the page when you try to quote it is worse
 * than one with no gesture at all.
 */

/** A wheel notch turns one page and then ignores the rest of the flick. */
const WHEEL_COOLDOWN_MS = 420;
/** Horizontal travel that counts as a swipe rather than a tap or a scroll. */
const SWIPE_THRESHOLD_PX = 48;
/** Beyond this the pointer was dragging, not tapping. */
const TAP_SLOP_PX = 6;
const TAP_TIMEOUT_MS = 400;
/** The outer quarter on each side turns; the middle half is for reading. */
const EDGE_FRACTION = 0.25;

export interface EpubInputHandlers {
  turn: (delta: 1 | -1) => void;
  resizeText: (delta: 1 | -1) => void;
  /** Read at event time: the direction can change while a book is open. */
  isRtl: () => boolean;
  /** A tap that is not a page turn — used to show or hide the chrome. */
  onTapCentre?: () => void;
}

export function installInputBridge(document: Document, handlers: EpubInputHandlers): () => void {
  const window = document.defaultView;
  if (!window) return () => undefined;

  let wheelBlockedUntil = 0;
  let down: { x: number; y: number; at: number; touch: boolean } | null = null;

  /**
   * Keys pressed while the book has focus — which is the normal state the
   * moment anyone clicks on the text — never reach the host window, so the
   * viewer's keyboard shortcuts simply stop working. Re-dispatching them onto
   * the host keeps one handler in charge of what each key means, rather than a
   * second copy in here that can drift out of step with it.
   */
  const onKeyDown = (event: KeyboardEvent) => {
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const host = window.parent;
    if (!host || host === window) return;
    // Dispatched on the host's body rather than its window, so the event has a
    // real element as its target and behaves like any other key press.
    (host.document?.body ?? host).dispatchEvent(
      new KeyboardEvent('keydown', {
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        bubbles: true,
      }),
    );
  };

  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      handlers.resizeText(event.deltaY < 0 ? 1 : -1);
      return;
    }
    // A trackpad emits a long tail of small deltas from one flick; without the
    // cooldown a single gesture would run through half the chapter.
    const now = Date.now();
    if (now < wheelBlockedUntil) {
      event.preventDefault();
      return;
    }
    wheelBlockedUntil = now + WHEEL_COOLDOWN_MS;
    event.preventDefault();
    handlers.turn(event.deltaY > 0 || event.deltaX > 0 ? 1 : -1);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    down = {
      x: event.clientX,
      y: event.clientY,
      at: Date.now(),
      touch: event.pointerType !== 'mouse',
    };
  };

  const onPointerUp = (event: PointerEvent) => {
    const origin = down;
    down = null;
    if (!origin) return;

    // Links and form controls keep their own meaning.
    if ((event.target as Element | null)?.closest?.('a, button, input, select, textarea')) return;

    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;

    if (origin.touch && Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
      // Swiping left drags the page leftwards, revealing what is to its right —
      // so the gesture direction is the opposite of the page it brings.
      handlers.turn(turnForSide(dx < 0 ? 'right' : 'left', handlers.isRtl()));
      return;
    }

    const moved = Math.abs(dx) > TAP_SLOP_PX || Math.abs(dy) > TAP_SLOP_PX;
    if (moved || Date.now() - origin.at > TAP_TIMEOUT_MS) return;

    const width = document.documentElement?.clientWidth || window.innerWidth;
    if (!width) return;

    if (event.clientX < width * EDGE_FRACTION) {
      handlers.turn(turnForSide('left', handlers.isRtl()));
    } else if (event.clientX > width * (1 - EDGE_FRACTION)) {
      handlers.turn(turnForSide('right', handlers.isRtl()));
    } else {
      handlers.onTapCentre?.();
    }
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointerup', onPointerUp);

  return () => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('wheel', onWheel);
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointerup', onPointerUp);
  };
}
