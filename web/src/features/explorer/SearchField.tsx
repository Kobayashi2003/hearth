import { useEffect, useRef, useState, type RefObject } from 'react';
import { Search, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Kbd } from '@/ui/Feedback';
import type { Explorer } from './useExplorer';

/**
 * Searches as you type, a moment after the last key; Enter searches at once
 * and Escape clears it. Clearing with the button also drops a type filter.
 */
export function SearchField({
  explorer,
  inputRef,
  autoFocus,
  className,
}: {
  explorer: Explorer;
  inputRef: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  className?: string;
}) {
  const { search, patch } = explorer;
  const [text, setText] = useState(search.q);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => setText(search.q), [search.q]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const commit = (value: string) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => patch({ q: value.trim() }), 300);
  };

  return (
    <label
      className={cn(
        'flex h-9 w-[clamp(9rem,32vw,22rem)] shrink-0 items-center gap-2 rounded-xl bg-surface px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-glaze',
        className,
      )}
    >
      <Search className="size-4 shrink-0 text-ink-3" />
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={text}
        onChange={event => {
          setText(event.target.value);
          commit(event.target.value);
        }}
        onKeyDown={event => {
          if (event.key === 'Escape' && text) {
            event.stopPropagation();
            setText('');
            patch({ q: '' });
          } else if (event.key === 'Enter') {
            window.clearTimeout(timer.current);
            patch({ q: text.trim() });
          }
        }}
        placeholder="Search here"
        aria-label="Search file names"
        className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-3"
      />
      {text ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setText('');
            patch({ q: '', type: undefined });
          }}
          className="text-ink-3 hover:text-ink"
        >
          <X className="size-4" />
        </button>
      ) : (
        <span className="hidden lg:block">
          <Kbd>/</Kbd>
        </span>
      )}
    </label>
  );
}
