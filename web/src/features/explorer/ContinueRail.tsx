import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { BookOpen, X } from 'lucide-react';
import type { FileEntry, LedgerDocument } from '@hearth/shared';

import { api, mediaUrls } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Tooltip } from '@/components/ui/primitives';
import { useBreakpoint } from '@/hooks/useBreakpoint';

/**
 * Continue reading — the first thing Ledger buys back.
 *
 * Shown only on the home folder: it is a landing surface, not something to
 * carry into every directory you open. Entries whose file has since gone are
 * dropped rather than shown as dead cards.
 */

/** Past this, the item is effectively finished and offering to resume is noise. */
const FINISHED_PERCENT = 97;
const MAX_ITEMS = 12;

interface Resumable {
  path: string;
  name: string;
  percent: number;
  detail: string;
}

function describe(ledger: LedgerDocument): Resumable[] {
  return ledger.recent
    .map(recent => {
      const progress = ledger.progress[recent.path];
      if (!progress || progress.percent >= FINISHED_PERCENT) return null;

      const name = recent.path.split(/[/\\]/).pop() ?? recent.path;
      const detail =
        progress.kind === 'page' && typeof progress.at === 'number' && progress.total
          ? `Page ${progress.at + 1} of ${progress.total}`
          : progress.kind === 'time' && typeof progress.at === 'number'
            ? `${formatClock(progress.at)} in`
            : `${progress.percent}% read`;

      return { path: recent.path, name, percent: progress.percent, detail };
    })
    .filter((item): item is Resumable => item !== null)
    .slice(0, MAX_ITEMS);
}

function formatClock(seconds: number): string {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const hours = Math.floor(minutes / 60);
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes % 60)}:${pad(total % 60)}` : `${minutes}:${pad(total % 60)}`;
}

export function ContinueRail({
  ledger,
  onOpen,
  onHide,
}: {
  ledger: LedgerDocument | undefined;
  onOpen: (entry: FileEntry) => void;
  /** Puts the shelves away; they come back from Settings → Appearance. */
  onHide: () => void;
}) {
  const breakpoint = useBreakpoint();
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());

  const pinned: Resumable[] = (ledger?.pinned ?? [])
    .filter(path => !gone.has(path))
    .map(path => ({
      path,
      name: path.split(/[/\\]/).pop() ?? path,
      // A pinned item shows its progress if it has any, but is listed because
      // it was pinned — not because it was started.
      percent: ledger?.progress[path]?.percent ?? 0,
      detail: 'Pinned',
    }))
    .reverse();

  // Stable per path, so the effect that reports a missing file does not re-run
  // on every parent render.
  const forget = useCallback(
    (path: string) => setGone(current => (current.has(path) ? current : new Set(current).add(path))),
    [],
  );

  if (!ledger) return null;
  const items = describe(ledger).filter(item => !gone.has(item.path));
  if (items.length === 0 && pinned.length === 0) return null;

  // A phone has no room for a rail beside a file listing, so it gets the single
  // most recent thing as a wide card. Wider screens get the row.
  const isSingle = breakpoint === 'narrow';

  return (
    <div className="group/shelves relative shrink-0 border-b border-subtle">
      <Shelf title="Pinned" items={pinned} isSingle={isSingle} onOpen={onOpen} onMissing={forget} />
      <Shelf title="Continue" items={items} isSingle={isSingle} onOpen={onOpen} onMissing={forget} />

      <Tooltip label="Hide these shelves">
        <button
          type="button"
          onClick={onHide}
          aria-label="Hide the pinned and continue shelves"
          className={cn(
            'absolute right-2 top-2 grid h-tap w-tap place-items-center rounded-density',
            'text-muted hover:bg-sunken hover:text-primary',
            // Out of the way until wanted; always reachable on a touchscreen,
            // where there is no hover to reveal it.
            'opacity-0 focus-visible:opacity-100 group-hover/shelves:opacity-100',
            '[@media(pointer:coarse)]:opacity-100',
          )}
        >
          <X className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );
}

function Shelf({
  title,
  items,
  isSingle,
  onOpen,
  onMissing,
}: {
  title: string;
  items: Resumable[];
  isSingle: boolean;
  onOpen: (entry: FileEntry) => void;
  onMissing: (path: string) => void;
}) {
  if (items.length === 0) return null;
  const shown = isSingle ? items.slice(0, 1) : items;

  return (
    <section aria-label={title} className="px-3 py-2.5">
      <h2 className="eyebrow mb-2">{title}</h2>
      <div className={cn(isSingle ? 'flex' : 'flex gap-density overflow-x-auto pb-1')}>
        {shown.map(item => (
          <ResumeCard
            key={item.path}
            item={item}
            wide={isSingle}
            onOpen={onOpen}
            path={item.path}
            onMissing={onMissing}
          />
        ))}
      </div>
    </section>
  );
}

function ResumeCard({
  item,
  wide,
  path,
  onOpen,
  onMissing,
}: {
  item: Resumable;
  wide: boolean;
  path: string;
  onOpen: (entry: FileEntry) => void;
  onMissing: (path: string) => void;
}) {
  /**
   * The entry is fetched when the card is clicked, not when it is drawn.
   *
   * A card needs only the path: the name comes from it, the thumbnail is
   * requested by it, and the progress comes from Ledger. Resolving every card up
   * front cost twelve requests on the home screen to produce nothing visible.
   * A file that has since disappeared now reveals itself either through its
   * thumbnail failing or by erroring on click — both honest, neither worth
   * twelve round trips.
   */
  const [isOpening, setOpening] = useState(false);

  const open = async () => {
    setOpening(true);
    try {
      onOpen(await api.entry(item.path));
    } catch {
      toast.error('That file is no longer there', { description: item.path });
      onMissing(path);
    } finally {
      setOpening(false);
    }
  };

  return (
    <button
      type="button"
      disabled={isOpening}
      onClick={() => void open()}
      className={cn(
        'group shrink-0 text-left disabled:opacity-60',
        wide ? 'flex w-full items-center gap-3' : 'w-[7.5rem]',
      )}
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-density bg-sunken',
          wide ? 'aspect-[2/3] w-16 shrink-0' : 'aspect-[2/3] w-full',
        )}
      >
        <Thumb path={item.path} />
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-black/45">
          <span className="block h-full bg-accent" style={{ width: `${Math.max(2, item.percent)}%` }} />
        </span>
      </div>

      <div className={cn('min-w-0', wide ? 'flex-1' : 'mt-1.5')}>
        <p
          className={cn('text-primary', wide ? 'line-clamp-2 text-sm font-medium' : 'line-clamp-2 text-xs leading-snug')}
          title={item.name}
        >
          {item.name}
        </p>
        <p className="tabular mt-0.5 truncate text-[0.6875rem] text-muted">{item.detail}</p>
      </div>
    </button>
  );
}

function Thumb({ path }: { path: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="flex h-full w-full items-center justify-center">
        <BookOpen className="h-5 w-5 text-muted" />
      </span>
    );
  }

  return (
    <img
      src={mediaUrls.thumbnail(path, 240)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}
