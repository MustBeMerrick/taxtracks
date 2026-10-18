# Tax Tracks

**Your taxes. On track.** — a private, single-household tax forecasting and
withholding tracker that replaces a personal tax spreadsheet: projected
federal and California liability, withholding vs. liability, refund or amount
due, income and investment results, and (coming) withholding calculators.

Next.js 16 · React 19 · TypeScript · SQLite (`node:sqlite`) · Recharts · Vitest.
Runs on the gmktec home server, like option-pilot-app and money-motion-app.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3004 (auth is skipped in dev)
```

The first request creates `data/taxtracks.db` and seeds a sample household.
**Settings › Data** clears it, resets it, exports a JSON backup or restores one.

On an iPhone on the same Wi-Fi: `http://10.0.0.23:3004` (allowed in `next.config.ts`).

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server on port 3004 |
| `npm run build` / `start` | Production build / serve |
| `npm test` | Vitest: money maths, Overview model invariants, repository |
| `npm run typecheck` / `lint` | TypeScript / ESLint |
| `npm run icons` | Regenerate favicon, app icons and `mark-svg.ts` from `src/components/brand/mark.svg` |
| `npm run auth:hash -- '<pw>'` | Print an `AUTH_PASSWORD_HASH` for the server env |

`scripts/compare-mark.mjs <reference.png> <out.png>` overlays the vector mark on a reference image.

## Deploy

```bash
deploy/deploy.sh init      # one time: create dirs + env on the server
deploy/deploy.sh deploy    # rsync committed HEAD, build, restart
```

Port 3004 on loopback, exposed via Cloudflare Tunnel (`taxtracks.mustbemerrick.com`)
and Tailscale Serve, with passkey + password auth. See [docs/deploy.md](docs/deploy.md).

See [AGENTS.md](AGENTS.md) for architecture and conventions.
