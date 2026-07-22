/** Domain entities shared by the server and the web client. */

export type MediaKind = 'image' | 'audio' | 'video';

export type SortField = 'name' | 'size' | 'mtime' | 'type';
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

export interface ComicManifest {
  /** Cache key used to fetch individual pages. */
  key: string;
  pageCount: number;
  /** Page filenames in reading order. */
  pages: string[];
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

export interface TrashSettings {
  enabled: boolean;
  retentionDays: number;
  maxSizeMB: number;
  autoCleanup: boolean;
}

// ── Beacon: search backend health ───────────────────────────────────────────

export type SearchProviderName = 'everything' | 'walk';

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
}

export interface ViewerSettings {
  htmlViewerEnabled: boolean;
  htmlExternalResourcesEnabled: boolean;
}
