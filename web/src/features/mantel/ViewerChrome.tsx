import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Download, Maximize2, Minimize2, Minus, Pin, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatSize, parentPathOf } from '@/lib/format';
import { mediaUrls } from '@/lib/api';
import type { PreviewItem } from './PreviewProvider';

/**
 * Every viewer wears the same header: title, containing folder, viewer-specific
 * controls, then the same three window controls in the same place. The previous
 * UI put these in a different spot per viewer, which is why nobody found pin or
 * minimise — here they are labelled and always in the same corner.
 */
export function ViewerChrome({
  item,
  controls,
  onClose,
  onMinimize,
  onTogglePin,
  onStep,
  isExpanded,
  onToggleExpand,
  children,
  contentClassName,
}: {
  item: PreviewItem;
  /** Viewer-specific controls, rendered before the window controls. */
  controls?: ReactNode;
  onClose: () => void;
  onMinimize: () => void;
  onTogglePin: () => void;
  onStep?: (delta: number) => void;
  /** Present only for compact `panel` viewers; adds an expand/collapse control. */
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  children: ReactNode;
  contentClassName?: string;
}) {
  const folder = parentPathOf(item.entry.path);
  const canStep = Boolean(onStep) && item.gallery.length > 1;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-subtle bg-overlay px-2 sm:px-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium text-primary" title={item.entry.name}>
            {item.entry.name}
          </h2>
          <p className="truncate font-mono text-[0.6875rem] text-muted">
            {folder || 'Home'} · <span className="tabular">{formatSize(item.entry.size)}</span>
          </p>
        </div>

        {controls}

        <div className="flex items-center gap-0.5">
          <Tooltip label="Download">
            <a
              href={mediaUrls.download(item.entry.path)}
              download={item.entry.name}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-secondary hover:bg-sunken hover:text-primary"
              aria-label="Download this file"
            >
              <Download className="h-4 w-4" />
            </a>
          </Tooltip>

          {onToggleExpand ? (
            <Tooltip label={isExpanded ? 'Shrink to a panel' : 'Expand to full screen'}>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleExpand}
                aria-pressed={isExpanded}
                aria-label={isExpanded ? 'Shrink to a panel' : 'Expand to full screen'}
              >
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </Tooltip>
          ) : null}

          <Tooltip label={item.pinned ? 'Unpin — close when leaving the folder' : 'Pin — keep open while browsing'}>
            <Button
              variant="ghost"
              size="icon"
              onClick={onTogglePin}
              aria-pressed={item.pinned}
              aria-label={item.pinned ? 'Unpin this preview' : 'Pin this preview'}
              className={cn(item.pinned && 'text-accent')}
            >
              <Pin className={cn('h-4 w-4', item.pinned && 'fill-current')} />
            </Button>
          </Tooltip>

          <Tooltip label="Minimise to the dock">
            <Button variant="ghost" size="icon" onClick={onMinimize} aria-label="Minimise this preview">
              <Minus className="h-4 w-4" />
            </Button>
          </Tooltip>

          <Tooltip label="Close">
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close this preview">
              <X className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      </header>

      <div className={cn('relative min-h-0 flex-1 overflow-hidden', contentClassName)}>
        {children}

        {canStep ? (
          <>
            <GalleryStep direction="previous" onClick={() => onStep?.(-1)} />
            <GalleryStep direction="next" onClick={() => onStep?.(1)} />
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Gallery arrows: large touch targets, faded until the pointer is near. */
function GalleryStep({
  direction,
  onClick,
}: {
  direction: 'previous' | 'next';
  onClick: () => void;
}) {
  const Icon = direction === 'previous' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${direction === 'previous' ? 'Previous' : 'Next'} file`}
      className={cn(
        'absolute top-1/2 z-10 flex h-14 w-11 -translate-y-1/2 items-center justify-center',
        'rounded-md bg-black/35 text-white/90 opacity-0 backdrop-blur-sm transition-opacity',
        'duration-[--duration-quick] hover:bg-black/55 focus-visible:opacity-100',
        'group-hover/viewer:opacity-100',
        direction === 'previous' ? 'left-2' : 'right-2',
      )}
    >
      <Icon className="h-6 w-6" />
    </button>
  );
}
