/** JSON-schema bound that disappears when the configured cap is unlimited. */
export function maxItems(cap: number): { maxItems?: number } {
  return Number.isFinite(cap) ? { maxItems: cap } : {};
}

export function maximum(cap: number): { maximum?: number } {
  return Number.isFinite(cap) ? { maximum: cap } : {};
}

/** Fastify wants a number; an unlimited body is the largest one it can compare against. */
export function bodyLimit(bytes: number): number {
  return Number.isFinite(bytes) ? bytes : Number.MAX_SAFE_INTEGER;
}

/** ISO time, or null for "never". */
export function isoOrNull(epochMs: number): string | null {
  return Number.isFinite(epochMs) ? new Date(epochMs).toISOString() : null;
}

/** For wire formats that report a cap as a number: 0 means unlimited, as in the configuration. */
export function capOrZero(cap: number): number {
  return Number.isFinite(cap) ? cap : 0;
}
