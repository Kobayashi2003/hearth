# Hearth

*Your files, at home.*

Hearth is a self-hosted file server for one person and one machine. Photos,
videos, music, comics, e-books and documents stay on hardware you own, and Hearth
is the window you reach them through from any browser — read a comic page by page,
watch a video with subtitle and audio-track selection, listen to an album, page
through an EPUB, edit a text file. Nothing is copied to the device you view from.

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
├── start.ps1 · caddy-env.ps1     # launcher; Caddy upstreams from .env
├── Caddyfile · Caddyfile.snippet  # standalone edge; routes shared with the gateway
├── .env.example                   # every configuration variable, documented
├── docs/                          # architecture, configuration, Everything setup, ADRs
├── packages/shared/src/           # @hearth/shared — types both tiers compile against
│   ├── entities.ts · api.ts       #   domain types and request/response contracts
│   ├── constants.ts · media.ts    #   MIME overrides, extension sets, cover rules
│   └── ledger.ts                  #   Ledger (positions) and Hob (preferences)
├── server/src/                    # @hearth/server — Fastify, loopback only
│   ├── main.ts · app.ts           #   entrypoint; Fastify assembly
│   ├── config/ · plugins/ · lib/  #   env, auth/errors/security, Vault and helpers
│   ├── adapters/                  #   Everything, ffmpeg
│   ├── modules/                   #   warden, vault, beacon, kiln, ember, ledger, hob, system
│   └── workers/                   #   worker_threads: walk, comic, archive, cover, office, psd
└── web/src/                       # @hearth/web — Vite + React SPA
    ├── lib/ · components/         #   API client, formatters; primitives and menus
    ├── hooks/                     #   the two adaptation axes (width, input) — ADR 0002
    └── features/
        ├── shell/ · auth/         #     app frame and bottom tray; login
        ├── explorer/              #     listing/, toolbar/, commands/, dialogs/, peek/
        ├── mantel/                #     preview window, dock, playback, viewers/
        ├── ledger/ · hob/         #     reading positions; preferences
        └── transfer/ · admin/     #     uploads; settings
```

**Subsystem names** (used throughout the code and logs): **Vault** — the root
tree, path resolution, containment; **Beacon** — name search; **Kiln** —
transcode, thumbnails, document rendering; **Warden** — auth and permissions;
**Ember** — the recycle bin; **Mantel** — the preview system; **Ledger** — where
you were; **Hob** — how you like things set.

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
