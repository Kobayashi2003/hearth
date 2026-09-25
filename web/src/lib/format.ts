const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const exponent = Math.min(SIZE_UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  const decimals = exponent === 0 ? 0 : value < 10 ? 1 : 0;
  return `${value.toFixed(decimals)} ${SIZE_UNITS[exponent]}`;
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Relative within the week, a date after that. */
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
  return Number.isFinite(timestamp) ? dateTime.format(timestamp) : '—';
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);
  const paddedSeconds = String(seconds).padStart(2, '0');
  return hours === 0
    ? `${minutes}:${paddedSeconds}`
    : `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`;
}

export function formatKind(entry: { name: string; isDirectory: boolean }): string {
  if (entry.isDirectory) return 'Folder';
  const extension = extensionOf(entry.name);
  return extension ? extension.slice(1).toUpperCase() : 'File';
}

/** Lower-case, with the dot; '' when there is none. */
export function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index <= 0 ? '' : name.slice(index).toLowerCase();
}

export function parentOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * The child of `folder` on the way down to `descendant`: coming out of
 * `A/B/C/D` into `A/B`, that is `A/B/C`, the folder to put the cursor back on.
 */
export function childLeadingTo(folder: string, descendant: string): string | null {
  const prefix = folder === '' ? '' : `${folder}/`;
  if (descendant === folder || !descendant.startsWith(prefix)) return null;
  const rest = descendant.slice(prefix.length);
  const cut = rest.indexOf('/');
  return prefix + (cut === -1 ? rest : rest.slice(0, cut));
}
