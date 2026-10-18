# Agent Handoff — Tax Tracks

Private, single-household tax forecasting app for Marc and Mae (Married Filing
Jointly, federal + California). The product spec lives outside the repo
(`~/Downloads/Tax_Tracks_Product_Specification.md`); deviations agreed since are
noted below. Sibling apps (`option-pilot-app`, `money-motion-app`) set the house
pattern — check them before inventing a new convention.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · plain CSS with design tokens ·
Recharts · lucide-react · SQLite via `node:sqlite` · Vitest · npm.

## Layout

```
src/app/              routes; (app)/ is the authenticated shell; actions.ts = all server actions
src/app/api/          auth (passkey + password, from option-pilot) and /api/export
src/proxy.ts          auth gate for every non-static request (skipped in dev)
src/components/       UI; client components start with 'use client'
src/lib/core/         PURE logic — money (integer cents), Overview model, domain types. Unit-tested.
src/lib/db.ts         SQLite open + numbered migrations (PRAGMA user_version)
src/lib/repository.ts all data access; stamps metadata, audit log, data-changed marker
src/lib/data.ts       server-only lazy singleton (never opened at build time)
src/lib/fixtures/     sample household seeded into an empty database
src/styles/tokens.css brand + light/dark tokens (spec §2.2–2.4)
deploy/               Dockerfile, compose.yml, deploy.sh, env.example
```

**Rules that matter**

- Tax and money logic lives in `src/lib/core/`, never in components.
- Money is integer cents end to end; dates are ISO strings.
- Dashboard totals are derived from records (`buildOverview`), never stored.
- Every amount carries provenance: `actual` / `projected` / `manual_estimate`.
- Under MFJ, choosing Marc or Mae filters attributable income/payroll only; liability stays joint.
- Every server action calls `requireSession()` (actions are reachable by direct POST).
- After awaiting an action, call `scheduleRefresh()` from `useScheduleRefresh()`.

## Data

Each domain table stores the full record as JSON in `data`, with `tax_year` pulled
out and indexed. Promote a field to a column when a query needs it. Schema changes
append a migration to `MIGRATIONS` in `src/lib/db.ts`; never edit a shipped one.
Recalculate saves a `CalculationRun` snapshot; the header flags results stale when
data changed after the latest run.

## Brand

The logo mark is a vector trace of Marc's brand art (`src/components/brand/mark.svg`).
Edit the SVG, then `npm run icons`. Don't hand-redraw it.

## Agreed deviations from the spec

- Scenarios (§4.5) is replaced by **Calculators** (`/calculators`): W-4 / Pub 15-T,
  DE-4, extra withholding per paycheck, bonus, estimated payments.
- No offline mode or service worker; the data lives on the server.

## Commands

```
npm run dev        # localhost:3005, auth skipped
npm test
npm run typecheck
npm run lint
deploy/deploy.sh deploy
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
