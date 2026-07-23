/**
 * Where the app is mounted is discovered at runtime rather than baked in at
 * build time. The same bundle therefore serves both deployments: standalone at
 * the origin root, and mounted under a path prefix behind the AppGateway.
 *
 * The prefix is derived from the URL the document itself was loaded from, so
 * nothing has to be configured in two places.
 */

/** Path prefix the app is served under, e.g. '' or '/hearth'. */
export const basePath = deriveBasePath();

/** Absolute base of the API, on the same origin so cookies and Range both work. */
export const apiBase = `${basePath}/api`;

function deriveBasePath(): string {
  const override = document.querySelector<HTMLMetaElement>('meta[name="hearth-base"]')?.content;
  if (override !== undefined) return normalize(override);

  // The bundle is loaded with a relative `base`, so the document's directory is
  // the mount point. `/hearth/index.html` and `/hearth/` both yield '/hearth'.
  const { pathname } = window.location;
  const directory = pathname.endsWith('/') ? pathname : pathname.replace(/\/[^/]*$/, '/');
  return normalize(directory);
}

function normalize(prefix: string): string {
  const trimmed = prefix.replace(/\/+$/, '');
  if (trimmed === '' || trimmed === '/') return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/** Build an API URL with query parameters, omitting empty ones. */
export function apiUrl(path: string, params?: Record<string, unknown>): string {
  const url = `${apiBase}${path}`;
  if (!params) return url;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `${url}?${serialized}` : url;
}
