import { useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * Where you are, and the way to somewhere else.
 *
 * The readout *is* the control: a separate "go to page" button would be a second
 * thing to find for what is plainly the same question, and tapping the page
 * number is what every e-reader has taught people to do. Shared by the comic and
 * the book, which is why it does not live in either.
 *
 * Drawn for a dark, translucent bar over the page rather than for a panel — both
 * readers put it there, and a control that changed colour between the two would
 * read as two different controls.
 */
export function PageJump({
  page,
  total,
  suffix,
  onJump,
}: {
  /** One-based; 0 while the count is still unknown. */
  page: number;
  total: number;
  /** Extra context shown beside the numbers, such as the chapter title. */
  suffix?: string;
  onJump: (page: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const canJump = total > 0 && page > 0;

  if (draft !== null) {
    return (
      <form
        className="flex shrink-0 items-center gap-1"
        onSubmit={event => {
          event.preventDefault();
          const wanted = Number.parseInt(draft, 10);
          if (Number.isFinite(wanted)) onJump(Math.min(Math.max(1, wanted), total));
          setDraft(null);
        }}
      >
        <input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onBlur={() => setDraft(null)}
          onKeyDown={event => {
            if (event.key === 'Escape') setDraft(null);
          }}
          inputMode="numeric"
          autoFocus
          aria-label={`Page number, 1 to ${total}`}
          className="tabular h-5 w-12 rounded bg-white/15 px-1 text-center text-[0.6875rem] text-white outline-none"
        />
        <span className="tabular text-[0.6875rem] text-white/70">/ {total}</span>
      </form>
    );
  }

  const readout = [canJump ? `${page} / ${total}` : '', suffix].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      disabled={!canJump}
      onClick={() => setDraft(String(page))}
      title={canJump ? 'Go to page' : undefined}
      className={cn(
        'tabular min-w-0 shrink truncate text-left text-[0.6875rem] text-white/70',
        canJump && 'hover:text-white',
      )}
    >
      {readout}
    </button>
  );
}
