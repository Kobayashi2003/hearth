# Hearth

*Your files, at home.*

Hearth is a self-hosted file server for one person and one machine. Photos,
videos, music, comics, e-books and documents stay on hardware you own, and Hearth
is the window you reach them through from any browser — read a comic page by page,
watch a video with subtitle and audio-track selection, listen to an album, read
an EPUB that remembers your place across devices, edit a text file. Nothing is copied to the device you view from.

It is deliberately **not** a sync service, a backup product, or a multi-tenant
SaaS: what the network carries is *access*, not custody.

A rewrite of SimpleFileServer on a leaner stack — Fastify plus a static React
SPA, with search delegated to [Everything](https://www.voidtools.com/).

---

## Requirements

- **Node.js 22 LTS** or newer
- **ffmpeg** and **ffprobe** on `PATH` — for video probe, transcode, subtitle
  extraction, and video thumbnails
- **Windows** for instant search via Everything (optional; a filesystem-walk
  fallback works everywhere). Bind Everything's HTTP server to `127.0.0.1` only —
  it serves file contents without authentication.
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
#   → http://localhost:17011

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
                                             └─► /hearth-api/* → backend :17010 (loopback)
```

- The backend binds **loopback only**. Every request, media byte streams
  included, arrives through the Caddy edge on a single public port.
- The frontend is **static assets** served directly by Caddy — there is no
  frontend server process, and nothing sits between the browser and a byte range.
  A `<video>` points at `/hearth-api/media/raw?…` and Caddy streams it straight through.
- The SPA is served under a **path prefix** (`/hearth`), because the same public
  port may also front sibling apps through a shared edge. Standalone,
  `start.ps1` runs its own Caddy; behind a shared edge, `start.ps1 -NoCaddy` lets
  that edge own the port. The build discovers its own prefix at runtime, so one
  artifact works either way.

---

## Project structure

```
Hearth/
├── start.ps1 · caddy-env.ps1      # launcher; Caddy upstreams from .env
├── Caddyfile · Caddyfile.snippet  # standalone edge; routes any edge can import
├── .env.example                   # every configuration variable, with defaults
├── docs/                          # 前端代码结构 · 后端代码结构 · 已实现功能 · 拟实现功能
├── packages/shared/src/           # @hearth/shared — types both tiers compile against
├── server/src/                    # @hearth/server — Fastify, loopback only
│   ├── config/ · plugins/ · lib/  #   env, auth/errors/security, Vault and helpers
│   ├── adapters/                  #   Everything, ffmpeg
│   ├── modules/                   #   warden, vault, beacon, kiln, ember, ledger, hob, system
│   └── workers/                   #   worker_threads: walk, comic, cover, archive, office, psd
└── web/src/                       # @hearth/web — Vite + React SPA
    ├── lib/ · ui/ · brand/        #   API client and helpers; primitives; the logo
    ├── features/                  #   session, preferences, progress, shell, explorer,
    │                              #   transfer, preview (viewers, audio player), settings
    └── vendor/epub-reader/        #   the EPUB reader component, copied in unchanged
```

The design and the reasoning behind it are documented, in Chinese, under `docs/`.

**Subsystem names** used in the code and logs: **Vault** — the root tree, path
safety, file operations; **Beacon** — name search; **Kiln** — streaming,
transcode, thumbnails, document rendering; **Warden** — auth and permissions;
**Ember** — the recycle bin; **Ledger** — where you were in each file; **Hob** —
how you like things set.

---

## Building and running

| Command | Effect |
|---|---|
| `npm install` | Install every workspace's dependencies |
| `npm run build` | Build shared types, backend, and the SPA |
| `npm run dev` | Backend + Vite dev server with hot reload; layers `.env.development`, which lifts every limit |
| `npm start` | Run the built backend in production mode (no Caddy) |
| `npm test` | Run the unit and integration tests |
| `npm run format` | Format the code with Prettier (`format:check` to verify) |
| `npm run typecheck` | Typecheck every workspace |
| `npm run lint` | Lint the whole repository |
| `npm run ruffle` | Download the pinned Ruffle build into `web/public/ruffle/`, for .swf files and Flash in old web pages |
| `.\start.ps1 -Build` | Production: build, then run backend + Caddy |
| `.\start.ps1 -NoCaddy` | Run the backend only; an external edge owns the port |

Configuration lives in `.env` at the repository root. Every variable is optional
and listed in [`.env.example`](.env.example) and `docs/后端代码结构.md`; the
defaults serve the bundled `./example` tree so a fresh clone runs without any setup.

---

## License

MIT.
