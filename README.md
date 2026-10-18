# Tax Tracks

Your taxes. On track.

Personal tax forecasting, tracking and decision-support PWA for macOS and iPhone. React + Vite + TypeScript.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server on http://localhost:5173 (add `-- --host` to reach it from an iPhone on the LAN) |
| `npm run build` | Typecheck and production build to `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | oxlint |
| `npm test` | Vitest |
| `npm run icons` | Regenerate favicon and app icons from `src/brand/mark.svg` |

`scripts/compare-mark.mjs <reference.png> <out.png>` overlays the vector mark on a reference image for tracing checks.

## Layout

- `src/styles/tokens.css` — brand and light/dark design tokens
- `src/theme/` — Light / Dark / System preference
- `src/brand/` — logo mark and lockups
- `src/app/` — shell state and navigation
- `src/components/shell/` — sidebar, header, iPhone tab bar
- `src/pages/` — sections (`/dev/brand` shows the brand sheet in development)
