import type {
  ApiErrorBody,
  ArchiveListing,
  ChunkedUploadSession,
  ComicManifest,
  CreateUserRequest,
  HobDocument,
  HobPatch,
  ListResponse,
  LockdownSettings,
  MediaKind,
  MediaProbe,
  OfficeContentResponse,
  OperationResponse,
  PermissionRule,
  PermissionRulesResponse,
  Progress,
  ProgressMap,
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
  VersionResponse,
  ViewerSettings,
  ZipTokenResponse,
} from '@hearth/shared';

/**
 * Root-absolute. Overridden at runtime by `<meta name="hearth-api-base">`, or at
 * build time by HEARTH_WEB_API_BASE (keep it equal to the server's HEARTH_API_PREFIX).
 */
export const apiBase = (
  document.querySelector<HTMLMetaElement>('meta[name="hearth-api-base"]')?.content ||
  import.meta.env.HEARTH_WEB_API_BASE ||
  '/hearth-api'
).replace(/\/+$/, '');

export function apiUrl(path: string, params?: Record<string, unknown>): string {
  return apiBase + withQuery(path, params);
}

function withQuery(path: string, params?: Record<string, unknown>): string {
  if (!params) return path;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal | undefined } = {},
): Promise<T> {
  const { method = 'GET', body, signal } = options;
  const response = await fetch(apiBase + path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ?? null,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      payload?.code ?? 'UNKNOWN',
      payload?.message ?? `Request failed (${response.status})`,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const get = <T>(path: string, params?: Record<string, unknown>, signal?: AbortSignal) =>
  request<T>(withQuery(path, params), { signal });
const send = <T>(method: string, path: string, body?: unknown) =>
  request<T>(path, { method, body });

export interface ListParams {
  path: string;
  sort: SortField;
  direction: SortDirection;
  limit?: number;
}

export interface SearchParams extends ListParams {
  q: string;
  recursive: boolean;
  type?: MediaKind | undefined;
}

export const api = {
  session: () => get<SessionResponse>('/auth/session'),
  logIn: (username: string, password: string) =>
    send<SessionResponse>('POST', '/auth/login', { username, password }),
  logOut: () => send<{ ok: boolean }>('POST', '/auth/logout'),

  list: (params: ListParams, signal?: AbortSignal) =>
    get<ListResponse>('/files', { ...params }, signal),
  search: (params: SearchParams, signal?: AbortSignal) =>
    get<SearchResponse>('/search', { ...params }, signal),

  makeDirectory: (path: string, name: string) =>
    send<{ path: string }>('POST', '/fs/mkdir', { path, name }),
  rename: (path: string, name: string) =>
    send<{ path: string }>('POST', '/fs/rename', { path, name }),
  copy: (sources: string[], destination: string) =>
    send<OperationResponse>('POST', '/fs/copy', { sources, destination }),
  move: (sources: string[], destination: string) =>
    send<OperationResponse>('POST', '/fs/move', { sources, destination }),
  remove: (paths: string[], permanent = false) =>
    send<OperationResponse>('DELETE', '/fs', { paths, permanent }),

  startChunkedUpload: (body: {
    path: string;
    relativePath: string;
    size: number;
    chunkSize: number;
  }) => send<ChunkedUploadSession>('POST', '/upload/chunked/init', body),
  completeChunkedUpload: (uploadId: string) =>
    send<UploadResponse>('POST', `/upload/chunked/${uploadId}/complete`),
  abortChunkedUpload: (uploadId: string) =>
    send<{ ok: boolean }>('DELETE', `/upload/chunked/${uploadId}`),
  requestZip: (paths: string[]) => send<ZipTokenResponse>('POST', '/download/zip', { paths }),

  readText: (path: string, encoding?: string) =>
    get<TextContentResponse>('/content', { path, encoding }),
  writeText: (path: string, content: string, encoding?: string) =>
    send<{ ok: boolean }>('PUT', '/content', { path, content, encoding }),
  probe: (path: string, signal?: AbortSignal) => get<MediaProbe>('/media/probe', { path }, signal),
  openComic: (path: string, signal?: AbortSignal) => get<ComicManifest>('/comic', { path }, signal),
  openArchive: (path: string, signal?: AbortSignal) =>
    get<ArchiveListing>('/archive', { path }, signal),
  readOffice: (path: string, signal?: AbortSignal) =>
    get<OfficeContentResponse>('/office', { path }, signal),
  readHtml: (path: string) =>
    get<{ html: string; externalResources: boolean }>('/html-proxy', { path }),
  backgrounds: () => get<{ backgrounds: string[] }>('/backgrounds'),

  progress: () => get<ProgressMap>('/ledger/progress'),
  patchProgress: (progress: Record<string, Progress | null>) =>
    send<ProgressMap>('PATCH', '/ledger/progress', { progress }),
  readingSession: (path: string, signal?: AbortSignal) =>
    get<{ record: unknown }>('/ledger/session', { path }, signal),
  saveReadingSession: (path: string, record: unknown) =>
    send<{ ok: boolean }>('PUT', '/ledger/session', { path, record }),
  removeReadingSession: (path: string) =>
    send<{ ok: boolean }>('DELETE', withQuery('/ledger/session', { path })),

  preferences: () => get<HobDocument>('/preferences'),
  patchPreferences: (body: HobPatch) => send<HobDocument>('PATCH', '/preferences', body),

  trash: () => get<TrashListResponse>('/trash'),
  restoreFromTrash: (ids: string[]) => send<OperationResponse>('POST', '/trash/restore', { ids }),
  purgeFromTrash: (id: string) => send<{ ok: boolean }>('DELETE', `/trash/${id}`),
  emptyTrash: () => send<{ removed: number }>('DELETE', '/trash'),
  trashSettings: () => get<TrashSettings>('/trash/settings'),
  setTrashEnabled: (enabled: boolean) => send<TrashSettings>('PUT', '/trash/settings', { enabled }),

  version: () => get<VersionResponse>('/system/version'),
  roots: () => get<RootsResponse>('/system/roots'),
  switchRoot: (id: string) => send<RootsResponse>('POST', '/system/roots', { id }),
  searchStatus: () => get<SearchHealth>('/system/search-status'),

  users: () => get<UsersResponse>('/admin/users'),
  createUser: (body: CreateUserRequest) => send<unknown>('POST', '/admin/users', body),
  updateUser: (username: string, body: UpdateUserRequest) =>
    send<unknown>('PATCH', `/admin/users/${encodeURIComponent(username)}`, body),
  deleteUser: (username: string) =>
    send<{ ok: boolean }>('DELETE', `/admin/users/${encodeURIComponent(username)}`),
  permissionRules: () => get<PermissionRulesResponse>('/admin/permissions'),
  savePermissionRules: (rules: PermissionRule[]) =>
    send<PermissionRulesResponse>('PUT', '/admin/permissions', { rules }),
  lockdown: () => get<LockdownSettings>('/admin/lockdown'),
  setLockdown: (adminOnly: boolean) =>
    send<LockdownSettings>('PUT', '/admin/lockdown', { adminOnly }),
  viewerSettings: () => get<ViewerSettings>('/admin/viewers'),
  saveViewerSettings: (body: Partial<ViewerSettings>) =>
    send<ViewerSettings>('PUT', '/admin/viewers', body),
};

/** URLs for elements that fetch their own bytes; same origin, so the cookie authenticates them. */
export const mediaUrls = {
  raw: (path: string) => apiUrl('/media/raw', { path }),
  transcode: (path: string, options: { audioTrack?: number; start?: number } = {}) =>
    apiUrl('/media/transcode', { path, ...options }),
  subtitle: (path: string, track: number) => apiUrl('/media/subtitle', { path, track }),
  /** `version` (mtime and size) lets the browser keep a thumbnail until the file changes. */
  thumbnail: (path: string, width = 320, version?: string) =>
    apiUrl('/thumbnail', { path, width, v: version }),
  download: (path: string) => apiUrl('/download', { path }),
  zip: (token: string) => apiUrl(`/download/zip/${token}`),
  comicPage: (key: string, page: string) => apiUrl(`/comic/${key}/${encodeURIComponent(page)}`),
  archiveEntry: (path: string, entry: string) => apiUrl('/archive/entry', { path, entry }),
  background: (name: string) => apiUrl('/background', { name }),
};
