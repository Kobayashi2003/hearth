/**
 * A file inside an archive has no path of its own; it is named by the
 * archive's path and its name inside, joined in one string so every viewer can
 * keep passing `entry.path` around. NUL is in no file name on any system, and
 * the server refuses any path with one in it, so such a path can never be
 * taken for a real file. Request URLs split it back into `path` and `member`.
 */
const SEPARATOR = '\u0000';

export function memberPath(archive: string, member: string): string {
  return `${archive}${SEPARATOR}${member}`;
}

export function isInArchive(path: string): boolean {
  return path.includes(SEPARATOR);
}

/** The archive and the name inside it, or null for an ordinary path. */
export function splitMemberPath(path: string): { archive: string; member: string } | null {
  const cut = path.indexOf(SEPARATOR);
  return cut === -1 ? null : { archive: path.slice(0, cut), member: path.slice(cut + 1) };
}
