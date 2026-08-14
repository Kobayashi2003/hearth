import type {
  ApiErrorBody,
  ArchiveListing,
  ChunkedUploadSession,
  ComicManifest,
  CreateUserRequest,
  FileEntry,
  HobDocument,
  HobPatch,
  LedgerDocument,
  LedgerPatch,
  ListResponse,
  LockdownSettings,
  MediaKind,
  MediaProbe,
  MediaTokenResponse,
  OfficeContentResponse,
  OperationResponse,
  PermissionRule,
  PermissionRulesResponse,
  RootsResponse,
  SearchHealth,
  SearchResponse,
  SessionResponse,
  SortDirection,
  SortField,
  TextContentResponse,
  TrashListResponse,
  TrashSettings,
  UpdateUserRequest,
  UploadResponse,
  UsersResponse,
  ViewerSettings,
  ZipTokenResponse,
} from '@hearth/shared';

import { apiBase, apiUrl } from './runtime-config.js';

/**
 * The whole HTTP surface, typed against the same contracts the server compiles
 * against. A wire-format change breaks both sides at build time rather than at
 * runtime in front of the user.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The session ended — the shell prompts for a fresh login rather than erroring. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  const response = await fetch(apiBase + path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  let payload: ApiErrorBody | null = null;
  try {
    payload = (await response.json()) as ApiErrorBody;
  } catch {
    // A non-JSON error body means something upstream failed; the status is all we have.
  }
  return new ApiError(
    response.status,
    payload?.code ?? 'UNKNOWN',
    payload?.message ?? `Request failed (${response.status})`,
    payload?.details,
  );
}

export interface ListParams {
  path: string;
  sort: SortField;
  direction: SortDirection;
  page?: number;
  limit?: number;
}

export interface SearchParams extends ListParams {
  q: string;
  recursive: boolean;
  type?: MediaKind | undefined;
}

export const api = {
  // ── Session ───────────────────────────────────────────────────────────────
  session: () => request<SessionResponse>('/auth/session'),
  logIn: (username: string, password: string) =>
    request<SessionResponse>('/auth/login', { method: 'POST', body: { username, password } }),
  logOut: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  // ── Browsing ──────────────────────────────────────────────────────────────
  list: (params: ListParams, signal?: AbortSignal) =>
    request<ListResponse>(query('/files', params), signal ? { signal } : {}),

  search: (params: SearchParams, signal?: AbortSignal) =>
    request<SearchResponse>(query('/search', params), signal ? { signal } : {}),

  /** One entry by path — Ledger stores paths, and resuming needs the entry. */
  entry: (path: string, signal?: AbortSignal) =>
    request<FileEntry>(query('/files/entry', { path }), signal ? { signal } : {}),

  mediaCollection: (kind: MediaKind, params: ListParams, signal?: AbortSignal) =>
    request<SearchResponse>(query(`/media/${kind}`, params), signal ? { signal } : {}),

  randomMedia: (kind: MediaKind, path: string) =>
    request<FileEntry>(query(`/media/${kind}/random`, { path })),

  // ── File operations ───────────────────────────────────────────────────────
  makeDirectory: (path: string, name: string) =>
    request<{ path: string }>('/fs/mkdir', { method: 'POST', body: { path, name } }),

  rename: (path: string, name: string) =>
    request<{ path: string }>('/fs/rename', { method: 'POST', body: { path, name } }),

  copy: (sources: string[], destination: string) =>
    request<OperationResponse>('/fs/copy', { method: 'POST', body: { sources, destination } }),

  move: (sources: string[], destination: string) =>
    request<OperationResponse>('/fs/move', { method: 'POST', body: { sources, destination } }),

  remove: (paths: string[], permanent = false) =>
    request<OperationResponse>('/fs', { method: 'DELETE', body: { paths, permanent } }),

  // ── Transfer ──────────────────────────────────────────────────────────────
  startChunkedUpload: (body: {
    path: string;
    relativePath: string;
    size: number;
    chunkSize: number;
  }) => request<ChunkedUploadSession>('/upload/chunked/init', { method: 'POST', body }),

  chunkedUploadStatus: (uploadId: string) =>
    request<ChunkedUploadSession>(`/upload/chunked/${uploadId}`),

  completeChunkedUpload: (uploadId: string) =>
    request<UploadResponse>(`/upload/chunked/${uploadId}/complete`, { method: 'POST' }),

  abortChunkedUpload: (uploadId: string) =>
    request<{ ok: boolean }>(`/upload/chunked/${uploadId}`, { method: 'DELETE' }),

  requestZip: (paths: string[], name?: string) =>
    request<ZipTokenResponse>('/download/zip', { method: 'POST', body: { paths, name } }),

  // ── Content ───────────────────────────────────────────────────────────────
  readText: (path: string, encoding?: string) =>
    request<TextContentResponse>(query('/content', { path, encoding })),

  writeText: (path: string, content: string, encoding?: string) =>
    request<{ ok: boolean }>('/content', { method: 'PUT', body: { path, content, encoding } }),

  probe: (path: string, signal?: AbortSignal) =>
    request<MediaProbe>(query('/media/probe', { path }), signal ? { signal } : {}),

  openComic: (path: string, signal?: AbortSignal) =>
    request<ComicManifest>(query('/comic', { path }), signal ? { signal } : {}),

  openArchive: (path: string, signal?: AbortSignal) =>
    request<ArchiveListing>(query('/archive', { path }), signal ? { signal } : {}),

  readOffice: (path: string, signal?: AbortSignal) =>
    request<OfficeContentResponse>(query('/office', { path }), signal ? { signal } : {}),

  readHtml: (path: string) =>
    request<{ html: string; externalResources: boolean }>(query('/html-proxy', { path })),

  mediaToken: (path: string) =>
    request<MediaTokenResponse>('/media/token', { method: 'POST', body: { path } }),

  backgrounds: () => request<{ backgrounds: string[] }>('/backgrounds'),

  // ── Recycle bin ───────────────────────────────────────────────────────────
  trash: () => request<TrashListResponse>('/trash'),
  restoreFromTrash: (ids: string[]) =>
    request<OperationResponse>('/trash/restore', { method: 'POST', body: { ids } }),
  purgeFromTrash: (id: string) => request<{ ok: boolean }>(`/trash/${id}`, { method: 'DELETE' }),
  emptyTrash: () => request<{ removed: number }>('/trash', { method: 'DELETE' }),
  trashSettings: () => request<TrashSettings>('/trash/settings'),
  setTrashEnabled: (enabled: boolean) =>
    request<TrashSettings>('/trash/settings', { method: 'PUT', body: { enabled } }),

  // ── System and administration ─────────────────────────────────────────────
  roots: () => request<RootsResponse>('/system/roots'),
  switchRoot: (id: string) => request<RootsResponse>('/system/roots', { method: 'POST', body: { id } }),
  searchStatus: () => request<SearchHealth>('/system/search-status'),

  users: () => request<UsersResponse>('/admin/users'),
  createUser: (body: CreateUserRequest) => request<unknown>('/admin/users', { method: 'POST', body }),
  updateUser: (username: string, body: UpdateUserRequest) =>
    request<unknown>(`/admin/users/${encodeURIComponent(username)}`, { method: 'PATCH', body }),
  deleteUser: (username: string) =>
    request<{ ok: boolean }>(`/admin/users/${encodeURIComponent(username)}`, { method: 'DELETE' }),

  permissionRules: () => request<PermissionRulesResponse>('/admin/permissions'),
  savePermissionRules: (rules: PermissionRule[]) =>
    request<PermissionRulesResponse>('/admin/permissions', { method: 'PUT', body: { rules } }),

  lockdown: () => request<LockdownSettings>('/admin/lockdown'),
  setLockdown: (adminOnly: boolean) =>
    request<LockdownSettings>('/admin/lockdown', { method: 'PUT', body: { adminOnly } }),

  viewerSettings: () => request<ViewerSettings>('/admin/viewers'),
  saveViewerSettings: (body: Partial<ViewerSettings>) =>
    request<ViewerSettings>('/admin/viewers', { method: 'PUT', body }),

  // ── Ledger — where you were ───────────────────────────────────────────────
  ledger: () => request<LedgerDocument>('/ledger'),
  patchLedger: (body: LedgerPatch) => request<LedgerDocument>('/ledger', { method: 'PATCH', body }),

  // ── Hob — how you like things set ─────────────────────────────────────────
  preferences: () => request<HobDocument>('/preferences'),
  patchPreferences: (body: HobPatch) =>
    request<HobDocument>('/preferences', { method: 'PATCH', body }),
};

/** Build a path with query parameters, relative to the API base. */
function query(path: string, params: object): string {
  return apiUrl(path, params as Record<string, unknown>).slice(apiBase.length);
}

/**
 * Direct URLs for elements that fetch their own bytes — `<img>`, `<video>`,
 * `<audio>`. These go straight to the API on the same origin, so the browser
 * handles Range requests natively with nothing in the byte path.
 */
export const mediaUrls = {
  raw: (path: string, token?: string) => apiUrl('/media/raw', { path, token }),
  transcode: (path: string, options: { token?: string; audioTrack?: number; start?: number } = {}) =>
    apiUrl('/media/transcode', { path, ...options }),
  subtitle: (path: string, track: number, token?: string) =>
    apiUrl('/media/subtitle', { path, track, token }),
  thumbnail: (path: string, width = 320) => apiUrl('/thumbnail', { path, width }),
  download: (path: string) => apiUrl('/download', { path }),
  zip: (token: string) => apiUrl(`/download/zip/${token}`),
  comicPage: (key: string, page: string) => apiUrl(`/comic/${key}/${encodeURIComponent(page)}`),
  archiveEntry: (path: string, entry: string) => apiUrl('/archive/entry', { path, entry }),
  background: (name?: string) => apiUrl('/background', { name }),
};
