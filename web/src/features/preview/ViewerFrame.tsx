import {
  ChevronLeft,
  ChevronRight,
  Download,
  FolderSearch,
  Maximize,
  Minimize,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { FileEntry } from '@hearth/shared';

import { explorerRoute, useRevealInFolder } from '@/features/explorer/search';
import { mediaUrls } from '@/lib/api';
import { cn } from '@/lib/cn';
import { parentOf } from '@/lib/format';
import { Button } from '@/ui/Button';
import { useOverlay } from './overlay';

/**
 * The chrome every viewer shares: name, position in the gallery, the viewer's
 * own controls, download, fullscreen, close. `immersive` floats the bar over
 * the content and hides it while the pointer rests. `paper` suits documents,
 * where a dark bar over a light page would draw the eye from the text.
 */
export function ViewerFrame({
  entry,
  children,
  actions,
  immersive = false,
  tone = 'stage',
  arrows = false,
  subtitle,
  className,
}: {
  entry: FileEntry;
  children: ReactNode;
  actions?: ReactNode;
  immersive?: boolean;
  tone?: 'stage' | 'paper';
  /** Side buttons for stepping through the gallery. */
  arrows?: boolean;
  subtitle?: ReactNode;
  className?: string;
}) {
  const { close, closeThen, step, index, total, isFullscreen, toggleFullscreen } = useOverlay();
  const search = explorerRoute.useSearch();
  const revealInFolder = useRevealInFolder();
  // Opened from search or a collection, or from a folder that is not its own.
  const awayFromFolder =
    search.q.trim() !== '' || search.type !== undefined || parentOf(entry.path) !== search.path;
  const idle = useIdle(immersive);
  const paper = tone === 'paper';
  const buttonVariant = paper ? 'quiet' : 'stage';

  const bar = (
    <header
      className={cn(
        // Narrow screens put the controls on a second row so the name keeps its width.
        'flex shrink-0 flex-wrap items-center gap-x-2 px-3 py-2 sm:min-h-14 sm:flex-nowrap sm:px-4',
        paper && 'border-b border-line bg-surface text-ink',
        immersive &&
          'absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/70 to-transparent pb-5 transition-opacity duration-300',
        immersive && idle && 'pointer-events-none opacity-0',
      )}
    >
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[15px] font-semibold" title={entry.name}>
          {entry.name}
        </h2>
        <p
          className={cn('tabular truncate text-[12px]', paper ? 'text-ink-3' : 'text-stage-ink/60')}
        >
          {subtitle ?? (total > 1 ? `${index + 1} of ${total}` : null)}
        </p>
      </div>
      <Button
        variant={buttonVariant}
        size="icon"
        onClick={close}
        aria-label="Close"
        title="Close (Esc)"
        className="sm:order-last"
      >
        <X />
      </Button>
      <div className="flex w-full items-center justify-end gap-0.5 overflow-x-auto sm:w-auto">
        {actions}
        {awayFromFolder ? (
          <Button
            variant={buttonVariant}
            size="icon"
            onClick={() => closeThen(() => revealInFolder(entry.path))}
            aria-label="Show in folder"
            title="Show in folder"
          >
            <FolderSearch />
          </Button>
        ) : null}
        <a
          href={mediaUrls.download(entry.path)}
          aria-label="Download"
          title="Download"
          className={cn(
            'grid size-tap place-items-center rounded-lg [&_svg]:size-[18px]',
            paper
              ? 'text-ink-2 hover:bg-sunken hover:text-ink'
              : 'text-stage-ink/80 hover:bg-white/10 hover:text-stage-ink',
          )}
        >
          <Download />
        </a>
        <Button
          variant={buttonVariant}
          size="icon"
          onClick={toggleFullscreen}
          aria-label="Full screen"
          title="Full screen"
        >
          {isFullscreen ? <Minimize /> : <Maximize />}
        </Button>
      </div>
    </header>
  );

  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-1 flex-col',
        paper && 'bg-surface text-ink',
        immersive && idle && 'cursor-none',
      )}
    >
      {bar}
      <div className={cn('relative min-h-0 flex-1', className)}>{children}</div>
      {arrows && total > 1 ? (
        <>
          <SideArrow side="left" hidden={immersive && idle} onClick={() => step(-1)} />
          <SideArrow side="right" hidden={immersive && idle} onClick={() => step(1)} />
        </>
      ) : null}
    </div>
  );
}

function SideArrow({
  side,
  hidden,
  onClick,
}: {
  side: 'left' | 'right';
  hidden: boolean;
  onClick: () => void;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous file' : 'Next file'}
      className={cn(
        'absolute top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full',
        'bg-black/35 text-white/85 backdrop-blur transition-opacity hover:bg-black/55 [&_svg]:size-6',
        side === 'left' ? 'left-3' : 'right-3',
        hidden && 'pointer-events-none opacity-0',
      )}
    >
      <Icon />
    </button>
  );
}

const IDLE_MS = 2500;

/** True after the pointer has rested for a while; any movement or key wakes it. */
export function useIdle(enabled: boolean): boolean {
  const [idle, setIdle] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const wake = useCallback(() => {
    setIdle(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    wake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.clearTimeout(timer.current);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
  }, [enabled, wake]);

  return enabled && idle;
}
