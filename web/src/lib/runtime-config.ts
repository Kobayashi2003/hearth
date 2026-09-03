/**
 * The API is always root-absolute at `/hearth-api`, so the SPA needs no
 * build-time knowledge of its own mount prefix: relative assets, hash routing,
 * root-absolute calls. The prefix is app-scoped rather than `/api` because under
 * app-gateway every app shares one origin.
 *
 * A deployment that mounts the API elsewhere overrides it with
 * `<meta name="hearth-api-base" content="…">`.
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
