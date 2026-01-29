# Nervur

AI brain that lives on the [Matrix](https://matrix.org) protocol. Nervur connects to a Matrix homeserver, gets its own identity, and provides an admin UI for managing the homeserver, users, rooms, and the brain itself.

## Architecture

```bash
nervur/
├── brain/          # Express.js API server
│   ├── app.js      # Routes: onboarding, Matrix admin, brain events
│   ├── config.js   # YAML config (data/config.yml)
│   ├── homeserver.js  # Matrix CS API client
│   ├── matrix-admin.js # User/room management, SSE sync
│   └── index.js    # Entry point
├── homeserver/     # Local homeserver provisioning
│   ├── docker.js   # Docker CLI wrapper (pull, compose up/down)
│   ├── routes.js   # Provisioning API (preflight, configure, start)
│   └── templates.js # Tuwunel config + docker-compose templates
├── admin/          # React admin UI (Vite + Tailwind)
│   └── src/
│       ├── pages/  # Onboarding wizard + settings
│       └── components/
└── docker/         # Production deployment
    ├── Dockerfile
    ├── docker-compose.yml
    └── deploy.sh   # One-command install/update script
```

## Prerequisites

- **Node.js 20+**
- **Docker** (for local homeserver provisioning)

## Quick Start

```bash
git clone https://github.com/nervur-ai/nervur.git
cd nervur
npm install
npm install --prefix admin
npm run dev
```

This starts two processes:

| Process | Port | What                                      |
| ------- | ---- | ----------------------------------------- |
| Brain   | 3000 | Express API with `--watch` hot reload     |
| Admin   | 5173 | Vite dev server (proxies `/api` to brain) |

Open **<http://localhost:5173>** to use the admin UI.

### Brain only (no UI)

```bash
npm run dev:brain
```

## How It Works

1. **Onboarding** -- the admin UI walks you through connecting to a Matrix homeserver (remote or local via Docker) and creating a brain identity
2. **Brain identity** -- registers a Matrix user, creates an admin room, stores credentials in `data/config.yml`
3. **Admin** -- manage users, rooms, invitations, and monitor the brain's Matrix sync via SSE

### Local homeserver mode

When you choose "local" during onboarding, Nervur provisions a [Tuwunel](https://github.com/matrix-construct/tuwunel) homeserver in Docker on your machine. The provisioning flow:

1. Preflight checks (Docker installed, ports available)
2. Generate `tuwunel.toml` config
3. Pull the Tuwunel image
4. Start via `docker compose`
5. Verify reachability

### Remote homeserver mode

Point Nervur at any existing Matrix homeserver. It registers a user and connects.

## Environment Variables

| Variable   | Default  | Description                   |
| ---------- | -------- | ----------------------------- |
| `PORT`     | `3000`   | Brain API port                |
| `DATA_DIR` | `./data` | Config and data directory     |
| `NODE_ENV` | --       | Set to `production` in Docker |

## Scripts

```bash
npm run dev          # Brain + Admin concurrently
npm run dev:brain    # Brain only
npm run start        # Production mode
npm test             # Vitest (129 tests)
npm run test:watch   # Vitest watch mode
npm run lint         # ESLint (brain + homeserver + admin)
npm run lint:fix     # Auto-fix lint issues
npm run format       # Prettier
npm run format:check # Check formatting (CI)
```

## Data

All persistent state lives in `data/config.yml` (or `$DATA_DIR/config.yml`). This file is created during onboarding and contains:

- Homeserver URL, server name, type (local/remote)
- Brain user ID, access token, admin room ID
- Registration key

In Docker, `DATA_DIR=/app/data` and is backed by a named volume.

## Tests

```bash
npm test
```

Runs 129 tests covering config management, onboarding flow, homeserver verification, admin endpoints, and Docker provisioning templates.

## Production

See [PRODUCTION-README.md](PRODUCTION-README.md) for deploying Nervur on your own server.
