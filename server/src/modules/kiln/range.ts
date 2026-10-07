/** Single ranges only; a multi-range request gets the whole entity, which is legal. */
export interface ByteRange {
  start: number;
  end: number;
}

export type RangeResult =
  { kind: 'none' } | { kind: 'satisfiable'; range: ByteRange } | { kind: 'unsatisfiable' };

const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;

export function parseRange(header: string | undefined, size: number): RangeResult {
  const match = header ? RANGE_PATTERN.exec(header.trim()) : null;
  if (!match) return { kind: 'none' };
  const [, rawStart = '', rawEnd = ''] = match;
  if (rawStart === '' && rawEnd === '') return { kind: 'none' };

  const bounds = rawStart === '' ? suffix(rawEnd, size) : explicit(rawStart, rawEnd, size);
  if (!bounds || !fits(bounds, size)) return { kind: 'unsatisfiable' };
  return {
    kind: 'satisfiable',
    range: { start: bounds.start, end: Math.min(bounds.end, size - 1) },
  };
}

/** An empty file can satisfy no range at all. */
function fits(bounds: ByteRange, size: number): boolean {
  return size > 0 && bounds.start < size && bounds.start <= bounds.end;
}

/** `bytes=-N`: the last N bytes. */
function suffix(rawLength: string, size: number): ByteRange | null {
  const length = Number.parseInt(rawLength, 10);
  return length > 0 ? { start: Math.max(0, size - length), end: size - 1 } : null;
}

/** `bytes=A-B`, or `bytes=A-` to the end. */
function explicit(rawStart: string, rawEnd: string, size: number): ByteRange {
  return {
    start: Number.parseInt(rawStart, 10),
    end: rawEnd === '' ? size - 1 : Number.parseInt(rawEnd, 10),
  };
}
export function contentRangeHeader(range: ByteRange, size: number): string {
  return `bytes ${range.start}-${range.end}/${size}`;
}
