/**
 * The API always lives at the origin root under `/hearth-api`, in both
 * development and production. The Caddy edge routes `/hearth-api` (the backend)
 * and `/hearth` (this SPA) as two independent root-level prefixes — the SPA's
 * mount point does not move the API — so a request to `/hearth-api/...` reaches
 * the backend wherever the bundle itself is served from. The prefix is
 * app-scoped rather than a generic `/api` because under the AppGateway every
 * app shares one origin.
 *
 * The SPA therefore needs no build-time knowledge of its mount prefix: assets
 * load through Vite's relative `base`, routing is hash-based, and API calls are
 * root-absolute. One artifact works standalone and under the AppGateway.
 *
 * A deployment that mounts the API elsewhere can override the base with
 * `<meta name="hearth-api-base" content="/somewhere/hearth-api">`.
 */
export const apiBase = deriveApiBase();

function deriveApiBase(): string {
  const override = document.querySelector<HTMLMetaElement>('meta[name="hearth-api-base"]')?.content;
  if (override) return override.replace(/\/+$/, '');
  return '/hearth-api';
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
