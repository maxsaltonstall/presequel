# Chrono Consulting — a SQL learning game

A browser-based learning game that teaches SQL from zero, through fill-in-the-blank puzzles set inside a comedic time-travel consulting firm.

## Status
Milestones A–C2 shipped: Chapters 1–4 playable end-to-end. Dropdown and word-bank mechanic modes. ~3000-row real-scale census data for Chapter 4. Production hardened (rate limiting, structured logging, CSP, dd-trace APM, custom Datadog metrics).

## Production

Live at `https://sequel.maxsaltonstall.com` on AWS Lightsail with Caddy (TLS) + systemd (process management) + Datadog Agent (observability).

Full deploy runbook: [`docs/deploy.md`](docs/deploy.md).

## Run locally

Requirements: Node 20+.

```bash
npm install
npx playwright install chromium  # first time only
npm start
```

Open http://localhost:5173.

## Scripts

| Command | What |
|---|---|
| `npm start` | Runs the game at http://localhost:5173 |
| `npm test` | Runs unit + integration tests (Node's test runner) |
| `npm run test:e2e` | Runs the Playwright smoke test |
| `npm run validate-content` | Validates every chapter/puzzle JSON and SQL |

## Project layout

See `docs/superpowers/specs/` for the full design spec.

- `server.js` — HTTP server + `/run` endpoint + DuckDB lifecycle
- `server/` — security validator, DuckDB module
- `src/` — frontend modules (vanilla JS, ES modules, no build step)
- `content/` — chapters (JSON + SQL) and reference markdown
- `tests/` — Node test-runner unit tests + Playwright smoke test

## Save data

Progress is stored in browser `localStorage` under the key `chronoConsultingState-v1`. Clear it to restart from Chapter 1.
