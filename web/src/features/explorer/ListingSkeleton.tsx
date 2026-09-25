import { cn } from '@/lib/cn';
import { COLUMNS } from './FileList';
import { ASPECT, GAP, PADDING, useGridLayout } from './FileGrid';

/** Name widths vary so the placeholder reads as a listing rather than a stripe pattern. */
const NAME_WIDTHS = [62, 45, 74, 38, 55, 68, 41, 50, 71, 36, 58, 47, 65, 43];
const GRID_ROWS = 3;

/**
 * The shape of the view a folder is about to fill, shown while it loads. It
 * appears only after a short delay and matches the real layout, so a slow
 * folder fills in place and a fast one never shows it at all.
 */
export function ListingSkeleton({
  view,
  tileSize,
  rowHeight,
  scrollRef,
}: {
  view: 'list' | 'grid';
  tileSize: number;
  rowHeight: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div role="status" aria-label="Loading" className="animate-placeholder">
      {view === 'grid' ? (
        <GridSkeleton tileSize={tileSize} scrollRef={scrollRef} />
      ) : (
        <ListSkeleton rowHeight={rowHeight} />
      )}
    </div>
  );
}

function ListSkeleton({ rowHeight }: { rowHeight: number }) {
  return (
    <>
      <div className="h-8 border-b border-line" />
      {NAME_WIDTHS.map((width, index) => (
        <div
          key={index}
          className={cn('grid items-center gap-3 px-4 sm:px-6', COLUMNS)}
          style={{ height: rowHeight }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="size-[calc(var(--row)-10px)] shrink-0 rounded-md bg-sunken" />
            <span className="h-2.5 rounded-full bg-sunken" style={{ width: `${width}%` }} />
          </div>
          <span className="hidden h-2.5 w-16 rounded-full bg-sunken md:block" />
          <span className="ml-auto h-2.5 w-10 rounded-full bg-sunken" />
        </div>
      ))}
    </>
  );
}

function GridSkeleton({
  tileSize,
  scrollRef,
}: {
  tileSize: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { columns } = useGridLayout(scrollRef, tileSize);
  return (
    <div
      className="grid"
      style={{
        padding: PADDING,
        gap: GAP,
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      }}
    >
      {Array.from({ length: columns * GRID_ROWS }, (_, index) => (
        <div key={index}>
          <div className="rounded-xl bg-sunken" style={{ aspectRatio: `1 / ${ASPECT}` }} />
          <div
            className="mt-2 h-2.5 rounded-full bg-sunken"
            style={{ width: `${NAME_WIDTHS[index % NAME_WIDTHS.length]}%` }}
          />
        </div>
      ))}
    </div>
  );
}
