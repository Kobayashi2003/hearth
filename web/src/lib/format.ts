/** Presentation helpers. Everything a user reads as a number is formatted here. */

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** Binary units, three significant figures — the shape a file manager uses. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';

  const exponent = Math.min(SIZE_UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  const decimals = exponent === 0 ? 0 : value < 10 ? 1 : 0;
  return `${value.toFixed(decimals)} ${SIZE_UNITS[exponent]}`;
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const absolute = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Recent times read as "3 hours ago" because that is how a person thinks about
 * a file they were just working on; older ones get a date, because "312 days
 * ago" is not something anyone can use.
 */
export function formatWhen(isoDate: string): string {
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) return '—';

  const elapsed = Date.now() - timestamp;
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return relative.format(-Math.round(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return relative.format(-Math.round(elapsed / HOUR), 'hour');
  if (elapsed < 7 * DAY) return relative.format(-Math.round(elapsed / DAY), 'day');
  return dateOnly.format(timestamp);
}

export function formatExactWhen(isoDate: string): string {
  const timestamp = Date.parse(isoDate);
  return Number.isFinite(timestamp) ? absolute.format(timestamp) : '—';
}

/** Media position and duration, e.g. "4:07" or "1:02:33". */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';

  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);

  const paddedSeconds = String(seconds).padStart(2, '0');
  if (hours === 0) return `${minutes}:${paddedSeconds}`;
  return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`;
}

/** The file's extension, uppercased, for the type column. */
export function formatKind(entry: { name: string; isDirectory: boolean }): string {
  if (entry.isDirectory) return 'Folder';
  const extension = entry.name.includes('.') ? entry.name.split('.').pop() : null;
  return extension ? extension.toUpperCase() : 'File';
}

/** The directory containing a path — shown beside recursive search results. */
export function parentPathOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

export function joinPath(directory: string, name: string): string {
  return directory === '' ? name : `${directory}/${name}`;
}
