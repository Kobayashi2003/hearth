/**
 * HTTP Range parsing for byte streams. Only single ranges are honoured;
 * a multi-range request falls back to the whole entity, which is a legal
 * response and avoids multipart/byteranges for no practical gain.
 */
export interface ByteRange {
  start: number;
  end: number;
}

export type RangeResult =
  | { kind: 'none' }
  | { kind: 'satisfiable'; range: ByteRange }
  | { kind: 'unsatisfiable' };

const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;

export function parseRange(header: string | undefined, size: number): RangeResult {
  if (!header) return { kind: 'none' };

  const match = RANGE_PATTERN.exec(header.trim());
  if (!match) return { kind: 'none' };

  const [, rawStart = '', rawEnd = ''] = match;
  if (rawStart === '' && rawEnd === '') return { kind: 'none' };

  let start: number;
  let end: number;

  if (rawStart === '') {
    // Suffix form: the last N bytes.
    const suffixLength = Number.parseInt(rawEnd, 10);
    if (suffixLength <= 0) return { kind: 'unsatisfiable' };
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number.parseInt(rawStart, 10);
    end = rawEnd === '' ? size - 1 : Number.parseInt(rawEnd, 10);
  }

  // An empty file can satisfy no range at all.
  if (size === 0 || start >= size || start > end) return { kind: 'unsatisfiable' };

  return { kind: 'satisfiable', range: { start, end: Math.min(end, size - 1) } };
}

export function contentRangeHeader(range: ByteRange, size: number): string {
  return `bytes ${range.start}-${range.end}/${size}`;
}
