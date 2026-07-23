# Configuration

Every setting is an environment variable read from `.env` at the repository root.
All are optional; the value shown is the default, chosen so a fresh clone runs
against the bundled `./example` tree with no setup.

Names are prefixed `HEARTH_`. The un-prefixed name from SimpleFileServer is still
accepted for one release and logs a deprecation warning at startup — rename it to
the prefixed form when convenient.

Startup **fails fast and loudly** on an invalid value rather than degrading
silently: a non-numeric port, a missing root directory, or a malformed
`USER_RULES` entry stops the server with a one-line reason.

## Server

| Variable | Default | Effect |
|---|---|---|
| `HEARTH_PORT` | `5111` | Backend listen port. Loopback only. |
| `HEARTH_HOST` | `127.0.0.1` | Backend bind address. Leave loopback; the Caddy edge is the only public door. |
| `HEARTH_CORS_ORIGIN` | `http://localhost:5110` | Allowed origins, comma-separated. |
| `HEARTH_API_PREFIX` | `/hearth-api` | Path prefix the API mounts under. App-scoped to avoid collision under the AppGateway. |

## Storage

| Variable | Default | Effect |
|---|---|---|
| `HEARTH_ROOT_DIRECTORIES` | `./example` | Comma-separated absolute paths to serve. The first is active at startup. |
| `HEARTH_BASE_DIRECTORY` | *(first root)* | Which root is active at startup, if not the first. |
| `HEARTH_DATA_DIRECTORY` | `./server/data` | Where `users.json`, `permissions.json`, and runtime state live. |
| `HEARTH_TEMP_DIRECTORY` | `./server/temp` | Base for caches (thumbnails, comics, chunks). |
| `HEARTH_BACKGROUNDS_DIRECTORY` | `./server/backgrounds` | Wallpaper images offered in the UI. |
| `HEARTH_STREAM_BUFFER_VIDEO` | `1048576` | Read-buffer bytes for video streams. |
| `HEARTH_STREAM_BUFFER_AUDIO` | `262144` | Read-buffer bytes for audio streams. |
| `HEARTH_STREAM_BUFFER_DEFAULT` | `65536` | Read-buffer bytes for everything else. |

## Authentication

| Variable | Default | Effect |
|---|---|---|
| `HEARTH_USER_RULES` | *(none)* | Static users: `user:pass:perms` entries joined by `;`. Perms are any of `r w d a`. Passwords may be plain text or a bcrypt hash. |
| `HEARTH_SESSION_EXPIRY_HOURS` | `24` | Session lifetime. |
| `HEARTH_SESSION_COOKIE_NAME` | `hearth_session` | Session cookie name. |
| `HEARTH_SESSION_COOKIE_SECURE` | `false` | Set `true` when served over HTTPS end to end. |
| `HEARTH_USERS_FILE` | `./server/data/users.json` | Managed users created through the admin UI. |
| `HEARTH_PERMISSIONS_FILE` | `./server/data/permissions.json` | Path-scoped permission rules. |
| `HEARTH_REDIS_URL` | *(none)* | Redis connection string. Set to make sessions survive a restart; otherwise sessions are in memory and a restart signs everyone out. |
| `HEARTH_MEDIA_TOKEN_SECRET` | *(random each boot)* | HMAC key for stream tokens. Set a fixed value so tokens survive a restart. |
| `HEARTH_MEDIA_TOKEN_TTL` | `3600` | Stream-token lifetime, seconds. |
| `HEARTH_ADMIN_ONLY_MODE` | `false` | Start locked to admin accounts. Toggleable at runtime. |

**Permission model.** Four verbs — `read`, `write`, `delete`, `admin` — checked
per user and per path. With no rules in `permissions.json`, a user's own
permission string applies everywhere. A rule narrows that for a path; rules are
ranked by how specifically their path matches, then user-specific over wildcard,
then deny over allow. `w` implies `d`, so existing `rw` accounts keep working.

## Upload

| Variable | Default | Effect |
|---|---|---|
| `HEARTH_MAX_UPLOAD_SIZE_MB` | `10240` | Per-file cap. `0` = unlimited. |
| `HEARTH_MAX_UPLOAD_FILES` | `0` | Max files per request. `0` = unlimited. |
| `HEARTH_CHUNK_UPLOAD_DIR` | `./server/temp/chunks` | Where resumable-upload parts are staged. |
| `HEARTH_CHUNK_SIZE_MB` | `10` | Default chunk size for resumable uploads. |
| `HEARTH_CHUNK_UPLOAD_TIMEOUT_HOURS` | `24` | Abandoned uploads past this are swept. |
| `HEARTH_MAGIC_NUMBER_VALIDATION` | `false` | Reject a file whose content contradicts its extension. |

## Recycle bin

| Variable | Default | Effect |
|---|---|---|
| `HEARTH_RECYCLE_BIN_ENABLED` | `true` | Delete moves to the bin instead of removing. Toggleable at runtime. |
| `HEARTH_RECYCLE_BIN_DIRECTORY` | `./server/data/trash` | Where deleted items are held. |
| `HEARTH_RECYCLE_BIN_AUTO_CLEANUP` | `true` | Prune the bin on a schedule. |
| `HEARTH_RECYCLE_BIN_RETENTION_DAYS` | `30` | Drop items older than this. `0` = never by age. |
| `HEARTH_RECYCLE_BIN_MAX_SIZE_MB` | `1024` | Drop oldest items past this size. `0` = no size cap. |

## Search

See [`everything-setup.md`](everything-setup.md) for the full picture.

| Variable | Default | Effect |
|---|---|---|
| `HEARTH_SEARCH_PROVIDER` | `auto` | `everything`, `walk`, or `auto` (use Everything when reachable, else walk). |
| `HEARTH_EVERYTHING_URL` | `http://127.0.0.1:8081` | Everything HTTP server address. **Keep it loopback** — it serves file contents unauthenticated. |
| `HEARTH_EVERYTHING_USERNAME` | *(none)* | Optional HTTP-server credential. |
| `HEARTH_EVERYTHING_PASSWORD` | *(none)* | Optional HTTP-server credential. |
| `HEARTH_EVERYTHING_TIMEOUT_MS` | `5000` | Per-query timeout. |
| `HEARTH_EVERYTHING_MAX_RESULTS` | `10000` | Hard cap on results per query. |
| `HEARTH_SEARCH_PROBE_COOLDOWN_MS` | `5000` | Backoff before re-probing a down Everything. |

## Media and content

| Variable | Default | Effect |
|---|---|---|
| `HEARTH_FFMPEG_PATH` | `ffmpeg` | ffmpeg binary. A bare name resolves on `PATH`. |
| `HEARTH_FFPROBE_PATH` | `ffprobe` | ffprobe binary. |
| `HEARTH_THUMBNAIL_CACHE_DIR` | `./server/temp/thumbnails` | Thumbnail cache. |
| `HEARTH_THUMBNAIL_FOR_GIF` | `false` | Generate thumbnails for animated GIFs (expensive). |
| `HEARTH_COMIC_CACHE_DIR` | `./server/temp/comics` | Extracted comic pages. |
| `HEARTH_PSD_CACHE_DIR` | `./server/temp/psd` | Rendered PSD composites. |
| `HEARTH_TRANSCODE_CRF` | `23` | x264 quality for on-the-fly transcode (lower = better, larger). |
| `HEARTH_TRANSCODE_PRESET` | `veryfast` | x264 speed/efficiency preset. |
| `HEARTH_MAX_TEXT_SIZE_MB` | `8` | Largest file the text viewer reads whole; beyond it, the head is shown. |
| `HEARTH_HTML_VIEWER_ENABLED` | `true` | Allow the sandboxed HTML viewer. Toggleable at runtime. |
| `HEARTH_HTML_EXTERNAL_RESOURCES` | `false` | Let the HTML viewer load remote images. Toggleable at runtime. |

## Rate limits

Requests per window, per IP. A `0` window is a minute.

| Variable | Default | Effect |
|---|---|---|
| `HEARTH_RATE_LIMIT_GLOBAL_MAX` | `1000` | Global ceiling. |
| `HEARTH_RATE_LIMIT_GLOBAL_WINDOW_MINUTES` | `1` | Global window. |
| `HEARTH_RATE_LIMIT_WRITE_MAX` | `100` | Write operations. |
| `HEARTH_RATE_LIMIT_WRITE_WINDOW_MINUTES` | `1` | Write window. |
| `HEARTH_RATE_LIMIT_SEARCH_MAX` | `50` | Search. |
| `HEARTH_RATE_LIMIT_SEARCH_WINDOW_MINUTES` | `1` | Search window. |
| `HEARTH_RATE_LIMIT_LOGIN_MAX` | `10` | Login attempts (brute-force protection). |
| `HEARTH_RATE_LIMIT_LOGIN_WINDOW_MINUTES` | `5` | Login window. |

## Logging

| Variable | Default | Effect |
|---|---|---|
| `HEARTH_LOG_LEVEL` | `info` | pino level. |
| `HEARTH_LOG_TO_FILE` | `true` | Write rotated daily logs to disk. |
| `HEARTH_LOG_DIRECTORY` | `./server/logs` | Where those logs go. |

## Development only

| Variable | Default | Effect |
|---|---|---|
| `HEARTH_DEV_API` | `http://127.0.0.1:5311` | Where the Vite dev server proxies the API. Only used by `npm run dev`. |
