import { cn } from '@/lib/cn';
import type { ResizeAxis } from './usePreviewWindow';

/**
 * The grips that make the preview a window you can size.
 *
 * Drawn inside the edges rather than outside them, because the window clips its
 * own overflow — and 6px in is where the pointer already is when it reaches for
 * an edge. Corners are larger, as they are on every desktop window, since a
 * corner is the grip people actually aim for.
 *
 * Absent on a coarse pointer: there is no hover to discover a 6px strip with,
 * and a finger on the edge of a photograph means "swipe", not "resize".
 */
const HANDLES: ReadonlyArray<{
  axis: ResizeAxis;
  label: string;
  className: string;
}> = [
  { axis: { x: 0, y: -1 }, label: 'top edge', className: 'inset-x-3 top-0 h-1.5 cursor-ns-resize' },
  { axis: { x: 0, y: 1 }, label: 'bottom edge', className: 'inset-x-3 bottom-0 h-1.5 cursor-ns-resize' },
  { axis: { x: -1, y: 0 }, label: 'left edge', className: 'inset-y-3 left-0 w-1.5 cursor-ew-resize' },
  { axis: { x: 1, y: 0 }, label: 'right edge', className: 'inset-y-3 right-0 w-1.5 cursor-ew-resize' },
  { axis: { x: -1, y: -1 }, label: 'top-left corner', className: 'left-0 top-0 h-3 w-3 cursor-nwse-resize' },
  { axis: { x: 1, y: -1 }, label: 'top-right corner', className: 'right-0 top-0 h-3 w-3 cursor-nesw-resize' },
  { axis: { x: -1, y: 1 }, label: 'bottom-left corner', className: 'bottom-0 left-0 h-3 w-3 cursor-nesw-resize' },
  { axis: { x: 1, y: 1 }, label: 'bottom-right corner', className: 'bottom-0 right-0 h-3 w-3 cursor-nwse-resize' },
];

export function PreviewResizeHandles({
  onResizeStart,
  onReset,
}: {
  onResizeStart: (axis: ResizeAxis, event: React.PointerEvent<HTMLElement>) => void;
  /** Double-clicking any grip forgets the remembered size for this kind. */
  onReset: () => void;
}) {
  return (
    <>
      {HANDLES.map(handle => (
        <div
          key={handle.label}
          // Not a button: it is a drag surface, and the keyboard has the
          // full-screen control for the same job.
          aria-hidden
          onPointerDown={event => onResizeStart(handle.axis, event)}
          onDoubleClick={onReset}
          className={cn('absolute z-30 touch-none', handle.className)}
        />
      ))}
    </>
  );
}
