/**
 * The Hearth mark: an arched fireplace opening with an ember burning inside.
 *
 * Drawn on a 32-unit grid with heavy strokes so it stays legible at 16 px in a
 * browser tab, where the arch reads as a container and the ember as a warm dot.
 * The surround inherits `currentColor` so the mark sits correctly on either
 * theme; only the ember is coloured.
 */
export function HearthMark({
  className,
  title = 'Hearth',
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label={title}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* The opening: a squared surround with an arched mouth. */}
      <path
        d="M4 27V11.5C4 7.36 7.36 4 11.5 4h9C24.64 4 28 7.36 28 11.5V27"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* The mantel — the shelf the room is arranged around. */}
      <path d="M2 27h28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      {/* The ember, banked at the base of the opening. */}
      <path
        d="M16 12c2.6 1.9 3.9 3.9 3.9 6a3.9 3.9 0 1 1-7.8 0c0-2.1 1.3-4.1 3.9-6Z"
        fill="var(--accent)"
      />
    </svg>
  );
}

/** Wordmark: the mark beside the lowercase name, for the header and login. */
export function HearthWordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <HearthMark className="h-6 w-6 text-primary" />
      <span className="text-[1.0625rem] font-semibold tracking-tight lowercase">hearth</span>
    </span>
  );
}
