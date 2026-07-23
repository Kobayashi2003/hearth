# Architecture

Hearth is a single-tenant file server: one backend, one static frontend, one
person. This document explains how the pieces fit and why they are shaped the way
they are.

## The thesis

The files live on a machine the owner controls. The network's only job is to let
them sit by those files from elsewhere — so the design optimises for *viewing and
managing a directory tree that already exists*, not for storing, syncing, or
backing it up. Two consequences run through everything:

1. **Nothing sits between the browser and a byte range.** Media is streamed, not
   copied to the client, and the stream path is kept as short as possible: a
   `<video>` element points at `/api/media/raw`, and the Caddy edge proxies it
   straight to the backend with `flush_interval -1`. There is no frontend server
   process to buffer or drop a long-lived Range connection.

2. **Path safety is a type, not a review item.** Every user-supplied path passes
   through one function that returns a branded `SafePath`; every filesystem call
   requires one. A path that has not been proven to live inside the active root
   cannot reach the filesystem, because it is the wrong type.

## Tiers

```
        Caddy edge (:30709, public)
        ├─ /hearth/*  → static SPA (web/dist), served directly
        └─ /api/*     → Fastify backend (127.0.0.1:5111, loopback)
                          ├─ Everything HTTP server (127.0.0.1, loopback)
                          └─ ffmpeg / ffprobe (child processes)
```

The frontend is a static bundle. It has one route, is fully auth-gated, and does
no server rendering — so there is nothing for a Node frontend tier to do, and
removing it removes the streaming problem at its root. The bundle uses relative
asset URLs and discovers its mount prefix at runtime, so the same artifact serves
both standalone and under a shared gateway.

## Backend layering

The backend is layered `routes → services → adapters → lib`, enforced by lint:

- **routes** validate input (JSON Schema), check permissions, and orchestrate.
  A route never touches `fs` or spawns a process.
- **services** own the business logic of one subsystem.
- **adapters** wrap the outside world — Everything's HTTP API, ffmpeg — and never
  import a service.
- **lib** holds the shared primitives: `Vault` (path safety), `HearthError`,
  MIME, listing/sorting/pagination, the worker pool.

Configuration is a **frozen object** built once at startup and validated eagerly.
The handful of settings an admin can change while running — the active root,
feature toggles — live in a separate `RuntimeState` store with change listeners,
so nothing mutates startup config and every reader derives the current value on
each use. This is what makes a root switch safe: the vault, the search provider,
and the trash all read the active root from `RuntimeState`, so none holds a stale
copy and no cache needs manual invalidation.

### Subsystems

Each is a folder under `modules/` with its own routes, service, and schema:

| Subsystem | Owns |
|---|---|
| **Warden** | Login, sessions (memory or Redis), users (env + managed), path-scoped permissions, and short-lived HMAC media tokens for cookie-free stream URLs. |
| **Vault** | Directory listing, file operations (copy/move/rename/delete with collision suffixing), multipart and resumable chunked upload, single-file and streamed-ZIP download. |
| **Beacon** | Name search behind a provider interface: an Everything HTTP adapter (primary) and a `worker_threads` filesystem walk (fallback), with health probing and automatic degradation. |
| **Kiln** | Raw Range streaming, ffmpeg probe/transcode/subtitle extraction, cached thumbnails, charset-aware text read/write, and worker-thread rendering of comics, Office documents, and PSDs, plus a sandboxed HTML proxy. |
| **Ember** | The recycle bin: move-to-bin on delete, restore to origin, retention- and size-based auto-cleanup. |
| **System** | Version/health, root listing and switching, admin toggles, and cache cleanup. |

### Cross-cutting concerns

- **Errors.** One `HearthError` type carries a code, an HTTP status, and a
  user-safe message. A single error hook maps it to a response; internal messages
  and absolute host paths never reach a client.
- **Cancellation.** Every long operation — search, ZIP, transcode, walk — takes an
  `AbortSignal` wired to client disconnect. ffmpeg children are killed on abort,
  verified by counting processes after 50 aborted streams.
- **Logging.** Structured pino, rotated daily, one line per completed request.
  Media streams log once at completion, not per range.
- **Workers.** CPU-bound jobs (filesystem walk, comic/Office/PSD rendering) run on
  `worker_threads` so a multi-second job never blocks the media stream on the main
  thread. Aborting terminates the worker.

## Search: why Everything

The previous build carried ~14 C#/.NET projects to answer "find files matching
this name under this directory" on an NTFS volume. Everything already does exactly
that — it reads the Master File Table and stays current through the USN change
journal, indexing a drive in seconds — so Hearth delegates to it over its HTTP
API and keeps a filesystem-walk fallback for when it is unreachable or the host is
not Windows. This deletes the entire `.NET` toolchain, a SQLite schema, a sidecar
process manager, and a native dependency from the repository.

The integration is a security boundary: Everything's index knows nothing of
Hearth's root or its permissions, so every returned path is re-verified against
the active root and re-checked against the requesting user's read permission
before it leaves the server. See [`everything-setup.md`](everything-setup.md).

## Frontend: Mantel and the URL

The frontend is React on Vite, routed by TanStack Router. Explorer state — the
current path, sort, search, and open preview — lives in the URL, so browser
back/forward behave the way they do in a file manager and any view is linkable.
Personal preferences (theme, density, wallpaper) live in local storage instead.

**Mantel** is the preview system. Its defining move is that playback state and the
`<audio>` element live in a provider *above* the preview overlay, so closing or
minimising the preview that started a track does not unmount the element — a
pinned album keeps playing while you browse. Several previews coexist: one fills
the overlay, the rest sit in a labelled dock along the bottom edge, and whatever
is playing keeps a live position readout there even after its preview is closed.

Viewers are lazily loaded — the EPUB, comic, Office, and Ruffle bundles are large
and most sessions open none of them — and each renders a shared `ViewerChrome`, so
the window controls (pin, minimise, close) sit in the same place everywhere. The
video player is decomposed into hooks (`useVideoPlayback`, `useResumePosition`)
and small components (controls, track menu) rather than one monolith; no component
file exceeds 300 lines.
