/**
 * HTTP contracts for the `/api` namespace. Every request body and response
 * payload the web client sends or receives is declared here, so a wire-format
 * change breaks the build on both sides at once.
 */
import type {
  FileEntry,
  Identity,
  ManagedUser,
  MediaKind,
  Page,
  PermissionRule,
  RootDescriptor,
  SortDirection,
  SortField,
  TrashItem,
} from './entities.js';

/** Every error response carries this shape; `code` is stable, `message` is user-safe. */
export interface ApiErrorBody {
  code: string;
  message: string;
  /** Present only for validation failures. */
  details?: unknown;
}

// ── Warden ──────────────────────────────────────────────────────────────────

export interface LoginRequest {
  username: string;
  password: string;
}

export interface SessionResponse {
  authenticated: boolean;
  identity: Identity | null;
  /** True when the server only accepts admin logins. */
  adminOnly: boolean;
}

export interface MediaTokenRequest {
  path: string;
}

export interface MediaTokenResponse {
  token: string;
  /** Null when tokens never expire. */
  expiresAt: string | null;
}

// ── Vault: browsing ─────────────────────────────────────────────────────────

export interface ListQuery {
  path?: string;
  sort?: SortField;
  direction?: SortDirection;
  page?: number;
  limit?: number;
}

export interface ListResponse extends Page<FileEntry> {
  /** Echoed back so the client can confirm which directory answered. */
  path: string;
}

// ── Beacon: search ──────────────────────────────────────────────────────────

export interface SearchQueryParams extends ListQuery {
  q?: string;
  recursive?: boolean;
  type?: MediaKind;
}

export interface SearchResponse extends Page<FileEntry> {
  /** Which provider answered — surfaced in the UI. */
  provider: string;
  /** True when `total` is an estimate rather than exact. */
  approximate: boolean;
}

// ── Vault: file operations ──────────────────────────────────────────────────

export interface MkdirRequest {
  /** Parent directory, root-relative. */
  path: string;
  name: string;
}

export interface RenameRequest {
  path: string;
  name: string;
}

/** Copy and move share a shape: many sources into one destination directory. */
export interface TransferRequest {
  sources: string[];
  destination: string;
}

export interface DeleteRequest {
  paths: string[];
  /** Bypass the recycle bin even when it is enabled. */
  permanent?: boolean;
}

/** Per-source outcome, so a partial failure still reports what succeeded. */
export interface OperationResult {
  path: string;
  ok: boolean;
  /** Final path after collision suffixing, when it differs from the request. */
  resultPath?: string;
  error?: string;
}

export interface OperationResponse {
  results: OperationResult[];
}

// ── Vault: transfer ─────────────────────────────────────────────────────────

export interface ChunkedUploadInitRequest {
  path: string;
  /** Filename including any relative directory segments for folder uploads. */
  relativePath: string;
  size: number;
  chunkSize: number;
}

export interface ChunkedUploadSession {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
  /** Indices already stored — lets an interrupted upload resume. */
  receivedChunks: number[];
}

export interface UploadedFile {
  path: string;
  size: number;
}

export interface UploadResponse {
  files: UploadedFile[];
}

export interface ZipRequest {
  paths: string[];
  /** Suggested archive filename, without extension. */
  name?: string;
}

export interface ZipTokenResponse {
  token: string;
  /** Null when download links never expire. */
  expiresAt: string | null;
}

// ── Kiln: content ───────────────────────────────────────────────────────────

export interface TextContentResponse {
  content: string;
  /** Detected or requested charset, echoed so the viewer can offer an override. */
  encoding: string;
  /** True when the file was truncated to the size cap. */
  truncated: boolean;
  size: number;
}

export interface TextWriteRequest {
  path: string;
  content: string;
  encoding?: string;
}

export interface OfficeContentResponse {
  /** Sanitised HTML fragment. */
  html: string;
  /** Sheet names, for spreadsheets. */
  sheets?: string[];
}

// ── Ember: recycle bin ──────────────────────────────────────────────────────

export interface TrashListResponse {
  items: TrashItem[];
  /** Total bytes held, so the UI can show pressure against the size cap. */
  totalSize: number;
}

export interface TrashRestoreRequest {
  ids: string[];
}

// ── System and administration ───────────────────────────────────────────────

export interface VersionResponse {
  name: string;
  version: string;
}

export interface HealthResponse {
  status: 'ok';
  uptimeSeconds: number;
}

export interface RootsResponse {
  roots: RootDescriptor[];
}

export interface SwitchRootRequest {
  id: string;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  permissions: string;
}

export interface UpdateUserRequest {
  password?: string;
  permissions?: string;
}

/**
 * An HTML file to preview: on its own as one sanitised document, or (when an
 * administrator lets pages use their local files) served with its folder at
 * `url` (under the API base), where its frames, linked pages and, if allowed,
 * scripts and Flash work.
 */
export type HtmlPreview =
  | { mode: 'document'; html: string; externalResources: boolean; blockedResources: number }
  /** `sandboxed` when scripts (the page's own, or Ruffle) run, sealed off from Hearth. */
  | { mode: 'site'; url: string; sandboxed: boolean };

/** The viewer's frame a site is shown in; a site's `_top` and `_parent` mean this frame. */
export const SITE_FRAME_NAME = 'hearth-site';

/**
 * Posted up through a sandboxed site's frames for a link aimed at another
 * frame, which the sandbox will not let a frame navigate itself.
 */
export interface SiteNavigateMessage {
  type: 'hearth-site-navigate';
  target: string;
  url: string;
}

export interface UsersResponse {
  users: ManagedUser[];
}

export interface PermissionRulesResponse {
  rules: PermissionRule[];
}
