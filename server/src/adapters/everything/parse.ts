/**
 * Everything's JSON has varied across versions: `size` may be a string or a
 * number, `date_modified` a FILETIME, epoch ms, or ISO string. Every observed
 * form is accepted here and covered by tests.
 */

export interface EverythingResult {
  absolutePath: string;
  name: string;
  size: number;
  mtimeMs: number;
  isDirectory: boolean;
}

export interface EverythingResponse {
  total: number;
  results: EverythingResult[];
}

/** FILETIME counts 100-nanosecond ticks from 1601-01-01. */
const FILETIME_EPOCH_OFFSET_MS = 11_644_473_600_000n;
const TICKS_PER_MILLISECOND = 10_000n;

/** Any plausible FILETIME is far larger than any plausible epoch-ms value. */
const FILETIME_THRESHOLD = 1e15;

export function parseTimestamp(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0;

  if (typeof raw === 'string' && !/^\d+$/.test(raw)) {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  const numeric = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;

  if (numeric >= FILETIME_THRESHOLD) {
    const ticks = BigInt(typeof raw === 'string' ? raw : Math.trunc(numeric));
    return Number(ticks / TICKS_PER_MILLISECOND - FILETIME_EPOCH_OFFSET_MS);
  }
  return numeric;
}

export function parseSize(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  const numeric = typeof raw === 'number' ? raw : Number(raw);
  // Everything reports -1 for folders and for entries whose size it has not read.
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

interface RawResult {
  type?: string;
  name?: string;
  path?: string;
  size?: string | number;
  date_modified?: string | number;
}

interface RawResponse {
  totalResults?: number | string;
  results?: RawResult[];
}

/** `path` is the containing directory; `name` is the entry. */
export function parseEverythingResponse(payload: unknown): EverythingResponse {
  const body = (payload ?? {}) as RawResponse;
  const rawResults = Array.isArray(body.results) ? body.results : [];

  const results: EverythingResult[] = [];
  for (const raw of rawResults) {
    if (!raw?.name) continue;
    const directory = raw.path ?? '';
    results.push({
      absolutePath: directory ? `${directory}\\${raw.name}` : raw.name,
      name: raw.name,
      size: parseSize(raw.size),
      mtimeMs: parseTimestamp(raw.date_modified),
      isDirectory: raw.type === 'folder',
    });
  }

  const declaredTotal = Number(body.totalResults);
  return {
    total: Number.isFinite(declaredTotal) ? declaredTotal : results.length,
    results,
  };
}
