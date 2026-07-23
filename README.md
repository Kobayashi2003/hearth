# Hearth

*Your files, at home.*

Hearth is a self-hosted file server for one person and one machine. Your
files — photos, videos, music, comics, e-books, documents — stay on hardware you
own, and Hearth is the window you reach them through from any browser: read a
comic page by page, watch a video with subtitle and audio-track selection, listen
to an album, page through an EPUB, edit a text file. Nothing is copied to the
device you are viewing from.

It is deliberately **not** a sync service, a backup product, or a multi-tenant
SaaS. The storage is physically yours and physically local; what the network
carries is *access*, not custody.

Hearth is a rewrite of SimpleFileServer: the same capabilities, on a leaner stack
(Fastify + a static React SPA), with search delegated to
[Everything](https://www.voidtools.com/) instead of a bespoke index.

---

## Requirements

- **Node.js 22 LTS** or newer
- **ffmpeg** and **ffprobe** on `PATH` — for video probe, transcode, subtitle
  extraction, and video thumbnails
- **Windows** for instant search via Everything (optional; a filesystem-walk
  fallback works everywhere). See [`docs/everything-setup.md`](docs/everything-setup.md).
- **Caddy** — the public edge, for a real deployment (optional in development)
- **Redis** — optional, only to make sessions survive a restart

---

## Quick start

```bash
npm install
npm run build

# Configure — the defaults serve the bundled ./example tree.
cp .env.example .env
#   set HEARTH_ROOT_DIRECTORIES to the folder(s) you want to serve
#   set HEARTH_USER_RULES to your own username and password

# Development: backend + Vite dev server, hot-reloading, one command.
npm run dev
#   → http://localhost:5110

# Production: backend + Caddy edge serving the built SPA.
.\start.ps1 -Build
#   → http://localhost:30709/hearth  (behind frp, in the intended deployment)
```

The default login for the example config is `admin` / `hearth` — change
`HEARTH_USER_RULES` before serving anything real.

---

## Deployment shape

```
Internet ─► frp tunnel ─► :30709 Caddy edge ─┬─► /hearth/*  → static SPA (web/dist)
                                             └─► /hearth-api/* → backend :5111 (loopback)
```

- The backend binds **loopback only**. Every request, media byte streams
  included, arrives through the Caddy edge on a single public port.
- The frontend is **static assets** served directly by Caddy — there is no
  frontend server process, and nothing sits between the browser and a byte range.
  A `<video>` points at `/hearth-api/media/raw?…` and Caddy streams it straight through.
- The SPA is served under a **path prefix** (`/hearth`), because the same public
  port may also front sibling apps via a shared AppGateway. Standalone,
  `start.ps1` runs its own Caddy; under the gateway, `start.ps1 -NoCaddy` lets the
  gateway own the port. The build discovers its own prefix at runtime, so one
  artifact works either way.

---

## Project structure

```
Hearth/
├── package.json              # npm workspace root
├── start.ps1                 # launcher — backend + Caddy edge
├── caddy-env.ps1             # derives Caddy upstreams from .env
├── Caddyfile                 # standalone edge site block
├── Caddyfile.snippet         # routes: /hearth-api → backend, /hearth → static SPA
├── .env.example              # every configuration variable, documented
├── docs/
│   ├── architecture.md       # how the pieces fit together
│   ├── configuration.md      # every env var, its default and effect
│   └── everything-setup.md   # installing and securing the search backend
├── packages/shared/          # @hearth/shared — types both tiers compile against
│   └── src/
│       ├── entities.ts       #   domain types (FileEntry, MediaProbe, …)
│       ├── api.ts            #   request/response contracts for the API
│       └── constants.ts      #   MIME overrides, extension sets, sort keys
├── server/                   # @hearth/server — Fastify backend
│   └── src/
│       ├── main.ts           #   entrypoint: load config → build app → listen
│       ├── app.ts            #   Fastify assembly and plugin registration
│       ├── context.ts        #   request decorators (session, resolvePath)
│       ├── config/           #   env → one frozen typed object + RuntimeState
│       ├── plugins/          #   auth, errors, security, rate-limit
│       ├── lib/              #   Vault (path safety), errors, mime, listing, workers
│       ├── adapters/         #   outward integrations: everything, ffmpeg
│       ├── modules/          #   one folder per subsystem (see below)
│       │   ├── warden/       #     auth, sessions, users, permissions, media tokens
│       │   ├── vault/        #     listing, file ops, upload, download
│       │   ├── beacon/       #     search — Everything adapter + walk fallback
│       │   ├── kiln/         #     stream, transcode, thumbnail, comic, office, html
│       │   ├── ember/        #     recycle bin
│       │   └── system/       #     roots, health, admin toggles, cache cleanup
│       └── workers/          #   worker_threads: walk, comic, office, psd
└── web/                      # @hearth/web — Vite + React SPA
    └── src/
        ├── main.tsx          #   React root, providers, router
        ├── router.tsx        #   TanStack Router; explorer state in the URL
        ├── lib/              #   typed API client, runtime config, formatters
        ├── components/       #   design-system primitives + brand mark
        ├── hooks/            #   preferences (theme, density, wallpaper)
        └── features/
            ├── auth/         #     login, session provider
            ├── shell/        #     app frame, wallpaper, preview layer mount
            ├── explorer/     #     list, grid, toolbar, search, selection, palette
            ├── mantel/       #     preview overlay, dock, playback, viewers
            ├── transfer/     #     upload queue and progress
            └── admin/        #     settings surface and its sections
```

**Subsystem names** (used throughout the code and logs): **Vault** — the root
tree, path resolution, containment; **Beacon** — name search; **Kiln** —
transcode, thumbnails, document rendering; **Warden** — auth and permissions;
**Ember** — the recycle bin; **Mantel** — the frontend preview system.

---

## Building and running

| Command | Effect |
|---|---|
| `npm install` | Install every workspace's dependencies |
| `npm run build` | Build shared types, backend, and the SPA |
| `npm run dev` | Backend + Vite dev server with hot reload |
| `npm test` | Run the backend unit and integration tests |
| `npm run typecheck` | Typecheck every workspace |
| `npm run lint` | Lint the whole repository |
| `.\start.ps1 -Build` | Production: build, then run backend + Caddy |
| `.\start.ps1 -NoCaddy` | Run the backend only; a shared gateway owns the port |

Configuration lives in `.env` at the repository root. Every variable is optional
and documented in [`docs/configuration.md`](docs/configuration.md); the defaults
serve the bundled `./example` tree so a fresh clone runs without any setup.

---

## License

MIT.
