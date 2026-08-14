/**
 * The Hearth mark: an arched fireplace opening with a fire burning inside.
 *
 * Drawn on a 32-unit grid with heavy strokes so it stays legible at 16 px in a
 * browser tab, where the arch reads as a container and the fire as a warm shape.
 * The surround inherits `currentColor` so the mark sits correctly on either
 * theme; only the fire is coloured.
 */
/**
 * The flame outline, shared with the favicon so the tab and the header cannot
 * drift apart. Sits inside the arch with clearance on the mantel line at y=27.
 */
const FLAME =
  'M17.4 9.6C18.2 12.6 19.6 14.2 20.6 15.8C21.6 17.4 21.8 19.3 20.9 21' +
  'C19.8 23.2 17.6 24.4 15.6 24.2C12.6 23.9 10.6 21.8 10.6 19.2' +
  'C10.6 17.4 11.5 15.8 13 14.4C13 16 13.6 17 14.7 17.4' +
  'C14 14.4 14.9 11.6 17.4 9.6Z';

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
      {/*
        The fire. A flame, not a drop: the tip leans off centre, the right flank
        swells where the heat is, and a notch is cut out of the left so a second
        tongue curls up inside it. A symmetrical teardrop — which is what this
        was — reads as water however warm its colour.
      */}
      <path d={FLAME} fill="var(--accent)" />
    </svg>
  );
}
