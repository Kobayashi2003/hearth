/** Domain entities shared by the server and the web client. */

export type MediaKind = 'image' | 'audio' | 'video';

/** `path`: by the folder an item is in, then its name; what tells apart a search's results. */
export type SortField = 'name' | 'size' | 'mtime' | 'type' | 'path';
export type SortDirection = 'asc' | 'desc';

export interface SortSpec {
  field: SortField;
  direction: SortDirection;
}

export interface FileEntry {
  name: string;
  /** Root-relative path, forward slashes, no leading slash. */
  path: string;
  size: number;
  /** ISO 8601. */
  mtime: string;
  mimeType: string;
  isDirectory: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

// ── Warden: identity and permissions ────────────────────────────────────────

export type PermissionAction = 'read' | 'write' | 'delete' | 'admin';

/**
 * A path-scoped ACL entry. `path` accepts glob suffixes `/**` and `/*`;
 * `deny` wins over `allow` at equal specificity.
 */
export interface PermissionRule {
  /** Username, or '*' for every user. */
  username: string;
  /** Root-relative path pattern, leading slash. */
  path: string;
  permissions: PermissionAction[];
  effect: 'allow' | 'deny';
}

export interface Identity {
  username: string;
  /** Compact permission string, e.g. 'rwda'. */
  permissions: string;
  /** Derived from `permissions` for convenient UI gating. */
  actions: PermissionAction[];
}

/** A user record managed through the admin surface (data/users.json). */
export interface ManagedUser {
  username: string;
  permissions: string;
  /** Present only in admin listings; never a password. */
  createdAt?: string;
}

// ── Kiln: media description ─────────────────────────────────────────────────

export interface MediaTrack {
  /** Ordinal within the track's own kind — the first audio track is always 0. */
  index: number;
  codec: string;
  language: string | null;
  title: string | null;
}

export interface MediaProbe {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  /** True when every stream is playable by browsers as-is. */
  browserPlayable: boolean;
  audioTracks: MediaTrack[];
  subtitleTracks: MediaTrack[];
}

/**
 * The parts of one audio file that holds many: an album's tracks, from its cue
 * sheet (beside it, or embedded in a FLAC), or an audiobook's chapters. Times
 * are seconds from the start of that file.
 */
export interface CueSheet {
  kind: 'tracks' | 'chapters';
  title: string | null;
  performer: string | null;
  /** `REM DATE`: usually just the year. */
  date: string | null;
  tracks: CueTrack[];
}

export interface CueTrack {
  number: number;
  title: string | null;
  /** Null when it is the album's performer. */
  performer: string | null;
  start: number;
}

export interface ComicManifest {
  /** Cache key used to fetch individual pages. */
  key: string;
  pageCount: number;
  /** Page filenames in reading order. */
  pages: string[];
}

/** One member of an archive, as listed without extracting anything. */
export interface ArchiveEntry {
  /** Path inside the archive, always with forward slashes. */
  name: string;
  /** Uncompressed size in bytes; 0 for a directory. */
  size: number;
  compressedSize: number;
  isDirectory: boolean;
  /** Epoch milliseconds, or 0 when the archive does not record one. */
  mtime: number;
  /** Password-protected: listed, but its contents cannot be shown without the password. */
  encrypted: boolean;
  /** Guessed from the name, as for a file on disk; empty for a folder. */
  mimeType: string;
}

export interface ArchiveListing {
  entries: ArchiveEntry[];
  /** Members in the archive, which may exceed the number listed. */
  total: number;
  /** True when `entries` is only a prefix — a huge archive is capped. */
  hasMore: boolean;
  /** True when every file inside is an image, so it can be read as a comic. */
  looksLikeComic: boolean;
  /** Files inside open in the usual viewers; false while an administrator has that turned off. */
  membersOpen: boolean;
}

// ── Ember: recycle bin ──────────────────────────────────────────────────────

export interface TrashItem {
  /** Opaque identifier used by restore/delete. */
  id: string;
  name: string;
  /** Root-relative path the item was deleted from. */
  originalPath: string;
  deletedAt: string;
  size: number;
  isDirectory: boolean;
}

/** What everyone who can delete needs to know: whether deleting can be undone. */
export interface TrashSettings {
  enabled: boolean;
  /** 0 when items are kept until the bin is emptied. */
  retentionDays: number;
}

// ── Beacon: search backend health ───────────────────────────────────────────

export type SearchProviderName = 'everything' | 'walk';

/** Which search answers now, for anyone: how results are ordered depends on it. */
export interface SearchProviderResponse {
  provider: SearchProviderName;
}

export interface SearchHealth {
  provider: SearchProviderName;
  healthy: boolean;
  /** Human-readable reason when degraded. */
  note: string | null;
  everything: {
    reachable: boolean;
    url: string;
    version: string | null;
    lastProbeAt: string | null;
    lastLatencyMs: number | null;
  };
  fallbackActive: boolean;
}

// ── System ──────────────────────────────────────────────────────────────────

export interface RootDescriptor {
  /** Stable identifier — an index-independent hash of the absolute path. */
  id: string;
  /** Display label (the directory's own name). */
  label: string;
  active: boolean;
  /** False while its folder or drive cannot be reached; it is served again once it can. */
  available: boolean;
}
