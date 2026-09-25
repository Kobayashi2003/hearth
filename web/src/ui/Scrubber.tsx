import { cn } from '@/lib/cn';

/** A seek bar: the played part in ember, what is buffered in a lighter track. */
export function Scrubber({
  value,
  max,
  buffered = 0,
  onChange,
  label,
  className,
}: {
  value: number;
  max: number;
  buffered?: number;
  onChange: (value: number) => void;
  label: string;
  className?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const played = Math.min(100, (value / safeMax) * 100);
  const loaded = Math.min(100, (buffered / safeMax) * 100);
  return (
    <div className={cn('group relative flex h-5 items-center', className)}>
      <div className="absolute inset-x-0 h-1 rounded-full bg-current/15 transition-[height] group-hover:h-1.5">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-current/25"
          style={{ width: `${loaded}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-ember"
          style={{ width: `${played}%` }}
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute size-3 -translate-x-1/2 rounded-full bg-ember opacity-0 transition-opacity group-hover:opacity-100"
        style={{ left: `${played}%` }}
      />
      <input
        type="range"
        min={0}
        max={safeMax}
        step="any"
        value={Math.min(value, safeMax)}
        aria-label={label}
        onChange={event => onChange(Number(event.target.value))}
        className="relative h-5 w-full cursor-pointer appearance-none bg-transparent opacity-0"
      />
    </div>
  );
}
