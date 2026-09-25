/**
 * Client-side caps, read at build time from `HEARTH_WEB_*` variables (only that
 * prefix is exposed to the bundle). As on the server, `0` means unlimited.
 */
function readLimit(raw: string | undefined, fallback: number): number {
  const value = raw === undefined || raw === '' ? fallback : Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value === 0 ? Number.POSITIVE_INFINITY : value;
}

export const clientLimits = {
  /** Past this many characters a text file is shown without syntax highlighting. */
  maxHighlightChars: readLimit(import.meta.env.HEARTH_WEB_MAX_HIGHLIGHT_CHARS, 400_000),
  /** Files uploaded at the same time. */
  parallelUploads: readLimit(import.meta.env.HEARTH_WEB_PARALLEL_UPLOADS, 2),
};
