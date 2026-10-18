# Deploying to the gmktec home server

Tax Tracks runs as a Docker container on the gmktec (Ubuntu Server) alongside
the other apps, on port **3005** bound to loopback (3000–3004 are taken; 3004 is sns-equity-simulator). The SQLite database lives on
the server's disk, *outside* the container, so deploys never touch data.
Everything is driven from the Mac via `deploy/deploy.sh`, the same as
option-pilot-app and money-motion-app.

## Current deployment (2026-10-17)

- `init` + `deploy` done; container healthy on `127.0.0.1:3005`.
- Env set: `APP_URL`, `AUTH_SESSION_SECRET`, `AUTH_PASSWORD_HASH`.
- Cloudflare Tunnel ingress added; `https://taxtracks.mustbemerrick.com` serves the app.
- Password sign-in works.
- Still to do: register passkeys, clear the sample data
  (Settings › Data) before entering real numbers.

## Server layout

```
~/apps/taxtracks/
├── src/     # deployed source (rsynced copy of committed HEAD)
├── data/    # taxtracks.db + timestamped backups — never touched by deploys
└── env      # runtime secrets (from deploy/env.example) — never in git
```

## One-time setup

1. SSH alias `gmktec` in `~/.ssh/config` (already set up for the other apps).
2. `deploy/deploy.sh init` — creates the folders above and uploads the env template.
3. Generate secrets on the Mac and put them in `~/apps/taxtracks/env` on the server:
   - `openssl rand -hex 32` → `AUTH_SESSION_SECRET`
   - `npm run auth:hash -- '<password>'` → `AUTH_PASSWORD_HASH` (keep the password in your password manager)
   - `APP_URL=https://taxtracks.mustbemerrick.com`
4. `deploy/deploy.sh deploy` — first build + start. An empty database is created and
   seeded with the sample household on the first request; clear it in Settings › Data.
5. Expose it (below), sign in with the password at the public URL, then
   **Settings › Security › Add passkey** on each device.

## Access

The container publishes `127.0.0.1:3005` only — not reachable from the LAN or the router.

- **Public (HTTPS)**: `https://taxtracks.mustbemerrick.com` via the existing Cloudflare
  Tunnel. App-level auth is what makes this safe to expose. The tunnel is
  **locally managed**: `cloudflared` runs as a systemd service reading
  `/etc/cloudflared/config.yml` (`~/.cloudflared/config.yml` is an older copy the
  service doesn't use). Deploy the app first, then on gmktec:

  1. Add an ingress rule to `/etc/cloudflared/config.yml`, **above** the final
     `http_status:404` catch-all:
     ```yaml
       - hostname: taxtracks.mustbemerrick.com
         service: http://localhost:3005
     ```
  2. Check it: `cloudflared tunnel ingress validate --config /etc/cloudflared/config.yml`
     and `cloudflared tunnel ingress rule --config /etc/cloudflared/config.yml https://taxtracks.mustbemerrick.com`
  3. Create the DNS record (uses `~/.cloudflared/cert.pem`):
     `cloudflared tunnel route dns 54baf9ca-8094-4191-b368-87595616f89d taxtracks.mustbemerrick.com`
  4. `sudo systemctl restart cloudflared`

Session cookies are `Secure`, so sign-in only works over HTTPS (the tunnel URL).
Local `npm run dev` skips auth entirely.

## Everyday commands

| Command | Effect |
|---|---|
| `deploy/deploy.sh deploy` | Ship latest **commit**: rsync → build image → restart |
| `deploy/deploy.sh db-push` | Local DB → server (checkpoints WAL, backs up server copy, confirms first) |
| `deploy/deploy.sh db-pull` | Server DB → local (checkpoints WAL, backs up local copy, confirms first) |
| `deploy/deploy.sh logs` | Tail app logs |
| `deploy/deploy.sh status` | `docker compose ps` (shows health) |
| `deploy/deploy.sh restart` / `stop` | Recreate (picks up env changes) / stop the container |

Overrides: `DEPLOY_HOST` (default `gmktec`), `DEPLOY_ROOT` (default `apps/taxtracks`),
`TT_PORT` on the server (default 3005).

## How a deploy works

`deploy` packages the current commit with `git archive` (never the dirty working
tree), rsyncs it to `src/` on the server, then remotely runs
`docker compose build app && docker compose up -d app`.

There's no separate migration step: `src/lib/db.ts` applies numbered migrations
(tracked in `PRAGMA user_version`) when the app first opens the database.

`.dockerignore` and `outputFileTracingExcludes` keep `data/` out of the image, so a
local database can never be baked into a build.

## Which database is "real"?

The server's. Enter data through the deployed app from any device. `db-push` and
`db-pull` are for seeding the server or debugging locally, and are manual,
confirmed and backed up — never automatic. Settings › Data › Export also downloads a
JSON backup from the running app.
