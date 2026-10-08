import {
  ChevronLeft,
  ChevronRight,
  Download,
  Ellipsis,
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
import { useCoarsePointer, useIsNarrow } from '@/hooks/useMediaQuery';
import { Button } from '@/ui/Button';
import { Menu, MenuItem } from '@/ui/Menu';
import { useOverlay } from './overlay';

/**
 * The chrome every viewer shares: name, position in the gallery, the viewer's
 * own controls, download, fullscreen, close (on a phone, the shared ones in a
 * menu). `immersive` floats the bar over
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
  swipes = false,
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
  /** The content steps through the gallery on a swipe, so a finger needs no arrows. */
  swipes?: boolean;
  subtitle?: ReactNode;
  className?: string;
}) {
  const idle = useIdle(immersive);
  const paper = tone === 'paper';
  const bar = (
    <ViewerBar
      entry={entry}
      actions={actions}
      subtitle={subtitle}
      paper={paper}
      floating={immersive}
      hidden={immersive && idle}
    />
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
      {arrows ? <GalleryArrows swipes={swipes} hidden={immersive && idle} /> : null}
    </div>
  );
}

/**
 * Name and place in the gallery, then the viewer's own controls, show in
 * folder, download, fullscreen and close. Floating, it lies over the content
 * on a gradient and fades out while the pointer rests. It clears the notch.
 */
function ViewerBar({
  entry,
  actions,
  subtitle,
  paper,
  floating,
  hidden,
}: {
  entry: FileEntry;
  actions: ReactNode;
  subtitle: ReactNode;
  paper: boolean;
  floating: boolean;
  hidden: boolean;
}) {
  const { close, index, total } = useOverlay();
  const narrow = useIsNarrow();
  return (
    <header
      className={cn(
        // One row everywhere: on a phone the shared buttons fold into a menu, so the name keeps its room.
        'flex shrink-0 items-center gap-x-1 px-2 pb-2 pt-[calc(0.5rem+var(--safe-top))] sm:min-h-14 sm:gap-x-2 sm:px-4',
        paper && 'border-b border-line bg-surface text-ink',
        floating &&
          'absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/70 to-transparent pb-5 transition-opacity duration-300',
        hidden && 'pointer-events-none opacity-0',
      )}
    >
      <div className="min-w-[30%] flex-1 pl-1">
        <h2 className="truncate text-[15px] font-semibold" title={entry.name}>
          {entry.name}
        </h2>
        <p
          className={cn('tabular truncate text-[12px]', paper ? 'text-ink-3' : 'text-stage-ink/60')}
        >
          {subtitle ?? (total > 1 ? `${index + 1} of ${total}` : null)}
        </p>
      </div>
      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
        {actions}
      </div>
      {narrow ? (
        <BarMenu entry={entry} paper={paper} />
      ) : (
        <BarButtons entry={entry} paper={paper} />
      )}
      <Button
        variant={paper ? 'quiet' : 'stage'}
        size="icon"
        onClick={close}
        aria-label="Close"
        title="Close (Esc)"
      >
        <X />
      </Button>
    </header>
  );
}

/**
 * What the shared buttons need: whether the file was opened away from its
 * folder (from search or a collection, or a folder that is not its own), how
 * to go there, and fullscreen.
 */
function useBarActions(entry: FileEntry) {
  const { closeThen, isFullscreen, toggleFullscreen } = useOverlay();
  const search = explorerRoute.useSearch();
  const revealInFolder = useRevealInFolder();
  const awayFromFolder =
    search.q.trim() !== '' || search.type !== undefined || parentOf(entry.path) !== search.path;
  return {
    awayFromFolder,
    reveal: () => closeThen(() => revealInFolder(entry.path)),
    isFullscreen,
    toggleFullscreen,
  };
}

/** The shared buttons as one menu, for a phone. iOS cannot make a page fullscreen, so it is left out there. */
function BarMenu({ entry, paper }: { entry: FileEntry; paper: boolean }) {
  const { awayFromFolder, reveal, isFullscreen, toggleFullscreen } = useBarActions(entry);
  return (
    <Menu
      trigger={
        <Button variant={paper ? 'quiet' : 'stage'} size="icon" aria-label="More" title="More">
          <Ellipsis />
        </Button>
      }
    >
      {awayFromFolder ? (
        <MenuItem icon={<FolderSearch />} onSelect={reveal}>
          Show in folder
        </MenuItem>
      ) : null}
      <MenuItem
        icon={<Download />}
        onSelect={() => window.location.assign(mediaUrls.download(entry.path))}
      >
        Download
      </MenuItem>
      {document.fullscreenEnabled ? (
        <MenuItem icon={isFullscreen ? <Minimize /> : <Maximize />} onSelect={toggleFullscreen}>
          {isFullscreen ? 'Leave full screen' : 'Full screen'}
        </MenuItem>
      ) : null}
    </Menu>
  );
}

/** What every viewer offers: show in folder (when it was opened elsewhere), download, fullscreen. */
function BarButtons({ entry, paper }: { entry: FileEntry; paper: boolean }) {
  const { awayFromFolder, reveal, isFullscreen, toggleFullscreen } = useBarActions(entry);
  const variant = paper ? 'quiet' : 'stage';

  return (
    <>
      {awayFromFolder ? (
        <Button
          variant={variant}
          size="icon"
          onClick={reveal}
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
        variant={variant}
        size="icon"
        onClick={toggleFullscreen}
        aria-label="Full screen"
        title="Full screen"
      >
        {isFullscreen ? <Minimize /> : <Maximize />}
      </Button>
    </>
  );
}

/** Previous and next, when there is a gallery to step through and no swipe does it instead. */
function GalleryArrows({ swipes, hidden }: { swipes: boolean; hidden: boolean }) {
  const { step, total } = useOverlay();
  const touch = useCoarsePointer();
  if (total < 2 || (swipes && touch)) return null;
  return (
    <>
      <SideArrow side="left" hidden={hidden} onClick={() => step(-1)} />
      <SideArrow side="right" hidden={hidden} onClick={() => step(1)} />
    </>
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
        // No backdrop blur: over a playing video it is redrawn every frame.
        'bg-black/45 text-white/85 transition-opacity hover:bg-black/60 [&_svg]:size-6',
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
