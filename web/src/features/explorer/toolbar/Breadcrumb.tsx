import { ChevronRight, Home } from 'lucide-react';

import { cn } from '@/lib/cn';

/** Keeps the trail on one line by eliding the middle of a deep path. */
const MAX_VISIBLE_SEGMENTS = 4;

export function Breadcrumb({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate: (path: string) => void;
}) {
  const segments = path === '' ? [] : path.split('/');
  const isElided = segments.length > MAX_VISIBLE_SEGMENTS;
  const visible = isElided ? segments.slice(-MAX_VISIBLE_SEGMENTS) : segments;
  const hiddenCount = segments.length - visible.length;

  return (
    <nav aria-label="Location" className="flex min-w-0 items-center gap-0.5 text-[0.8125rem]">
      <Crumb label={<Home className="h-3.5 w-3.5" />} title="Home" onClick={() => onNavigate('')} />

      {isElided ? (
        <>
          <Separator />
          <Crumb
            label="…"
            title={`${hiddenCount} more folder${hiddenCount === 1 ? '' : 's'}`}
            onClick={() => onNavigate(segments.slice(0, hiddenCount).join('/'))}
          />
        </>
      ) : null}

      {visible.map((segment, index) => {
        const absoluteIndex = hiddenCount + index;
        const target = segments.slice(0, absoluteIndex + 1).join('/');
        const isLast = absoluteIndex === segments.length - 1;

        return (
          <span key={target} className="flex min-w-0 items-center gap-0.5">
            <Separator />
            <Crumb
              label={segment}
              title={segment}
              isCurrent={isLast}
              onClick={() => onNavigate(target)}
            />
          </span>
        );
      })}
    </nav>
  );
}

function Separator() {
  return <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted" />;
}

function Crumb({
  label,
  title,
  isCurrent,
  onClick,
}: {
  label: React.ReactNode;
  title: string;
  isCurrent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-current={isCurrent ? 'page' : undefined}
      className={cn(
        'max-w-[12rem] truncate rounded px-1.5 py-1 transition-colors duration-[var(--duration-instant)]',
        isCurrent ? 'font-medium text-primary' : 'text-secondary hover:bg-sunken hover:text-primary',
      )}
    >
      {label}
    </button>
  );
}
