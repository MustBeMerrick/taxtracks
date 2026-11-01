# Agent Handoff — Tax Tracks

Private, single-household tax forecasting app for Marc and Mae (Married Filing
Jointly, federal + California). The product spec lives outside the repo
(`~/Downloads/Tax_Tracks_Product_Specification.md`); deviations agreed since are
noted below. Sibling apps (`option-pilot-app`, `money-motion-app`) set the house
pattern — check them before inventing a new convention.

## Status (as of 2026-10-17)

The boilerplate is complete and live. Built in four phases, each reviewed by Marc:

| Phase | What | State |
|---|---|---|
| 1 | Scaffold, design tokens, light/dark/system theme, vector logo + icons | Done |
| 2 | Responsive shell: sidebar ≥1100px, icon rail 768–1099px, iPhone top bar + tab bar | Done |
| 3 | Overview dashboard (KPIs, liability vs. payments, income, Fed vs. CA, investments, withholding, paychecks, activity) | Done, on **sample data** |
| 4 | Data layer, auth, deploy — moved from a Vite PWA + IndexedDB to this Next.js + server SQLite stack | Done |

**Deployed:** gmktec, container healthy on `127.0.0.1:3005`, public at
`https://taxtracks.mustbemerrick.com` via the Cloudflare Tunnel. Marc has signed in
with the password. Not yet done on the server: passkeys registered, sample
data cleared.

**Placeholders:** Income, Payroll, Tax Engine, Calculators and Reports are stub
pages listing what's planned (`src/components/pages/sections.tsx`). Liabilities are
hand-entered sample values (`rulesVersion: 'placeholder-liabilities'`), not engine output.

## Next up — where to pick up

1. **Paystubs** (page `/payroll`, formerly "Payroll & Withholding"). Marc's decisions, 2026-11-01:
   - **Phase 1 (built):** one table per person (Marc, Mae). Each row has a **Paid Out** checkbox
     = `status: 'actual'` (unchecked = `'projected'`, up in the air). YTD columns count Paid Out rows
     only. Manual entry (add/edit dialog, line items from the ADP stub). Hard-rule warnings in
     `src/lib/core/payroll.ts`: Social Security over the annual max, 401(k)/FSA/HSA limits, negative
     net, duplicate dates, paid-but-future, unpaid-but-past.
   - **Phase 2 (next):** **Elections** — W-4/DE-4 typed in by Marc from ADP, versioned by effective
     date, history never changes. A **"Simulate new elections"** button reads the entries on the
     Calculators page and shows what the not-Paid-Out rows WOULD become (clearly labelled as
     simulated, with what could change). Optional **commit** applies them to the not-Paid-Out rows
     (saves a new dated election); if not committed everything reverts. Never write without commit.
   - **Phase 3:** projected paychecks from the pay schedule + current election; expected vs. actual
     withholding comparison.
   - No bonus/RSU stubs yet. Mae's stubs are the same ADP layout.
2. **Income & Investments:** per-source summaries and transaction ledger, ST/LT
   netting, dividends (qualified vs. ordinary), estimated vs. confirmed.
3. **Tax Engine:** 2026 federal + California, tax-year-versioned rule sets, traceable
   calculation tree; replaces the placeholder liabilities and feeds Recalculate.
4. **Reports** (optional, P2).

The Simulator's federal/CA year-end numbers need the Tax Engine; until it exists,
drive them from the placeholder liabilities and label them as estimates.

Small open items:
- Fail fast at startup when `AUTH_SESSION_SECRET` / `AUTH_PASSWORD_HASH` is empty
  (a blank secret currently surfaces only as a login error).
- `selectTaxYear` exists but there's no UI to add a new tax year.

## Working with Marc

- Plan work as phases and **stop after each for review** before continuing.
- Commit only when asked. Commit body = short `-- ` bullets, one line each, ~6 max;
  never add a Co-Authored-By trailer.
- Don't drive a browser (Claude in Chrome) unless Marc asks. Verify with typecheck, lint,
  tests, build and curl; for visual checks, tell Marc what to look at (desktop, ~900px,
  390px iPhone width; light and dark).
- Use sample data or redacted layouts; don't ask for real tax figures in chat.

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

- Scenarios (§4.5) is dropped. Its what-if role is the **Calculators page** (W-4 / Pub 15-T,
  DE-4, extra withholding per paycheck, bonus, estimated payments). It was briefly planned
  as a Payroll Simulator tab; Marc reversed that on 2026-11-01 — keep `/calculators`.
  First calculator: salary paycheck (ADP-style tabs: Earnings, Federal, State, Benefits).
  Pure logic is `src/lib/core/withholding/` (rules per tax year, generated tables from the
  IRS/EDD PDFs, tested against a real pay stub).
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
