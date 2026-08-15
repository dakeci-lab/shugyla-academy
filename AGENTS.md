# AGENTS.md

Project overview, architecture, and working conventions live in `CLAUDE.md` (read it first).
Quick start and commands are in `README.md` and the `scripts` block of `package.json`.

## Cursor Cloud specific instructions

Durable, non-obvious notes for running this repo in a Cloud Agent VM. Standard commands
(`npm run dev`, `npm run build`, `verify:*`, Playwright) are documented in `README.md`,
`CLAUDE.md`, and `package.json` — refer to those rather than duplicating them here.

### Runtime / dependencies
- Dependencies install via `npm ci` (the update script runs this on VM startup). CI pins
  Node 20; the VM ships Node 22, which runs the app, build, and verify scripts fine (there is
  no `engines`/`.nvmrc` pin).
- Docker is **not** installed in the VM. `npm run supabase:local:bootstrap` and any
  `supabase:local:*` verify script need Docker + the Supabase CLI, so they cannot run here
  without first installing Docker. Prefer the local/offline mode below for day-to-day work.

### Running the app (default: local/offline demo mode)
- `npm run dev` serves the SPA at http://localhost:5173. On `localhost` the host router
  returns the COMBINED surface, so corporate + platform + careers routes are all available.
- With **no** `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set, `src/lib/dataMode.js` selects
  the `*LocalAdapter` (localStorage) implementations and legacy demo auth — the app is fully
  interactive without any backend. This is the fastest way to smoke-test UI/logic changes.
- Demo logins (offline mode only): `admin` / `admin123` (admin), `kassir` / `123456` (cashier),
  `adminzal` / `123456` (floor admin). Log in at `/login`, platform lives under `/platform/*`.
- Cloud-only features are inert in offline mode (payroll, employee documents/Storage, in-app
  notifications, Web Push, Supabase Auth flows, UMAG sync, and Edge-Function-backed admin CRUD
  such as `admin-team-workforce-data`). To exercise those you must run against a real Supabase
  (local Docker stack or a remote project) and set the two `VITE_SUPABASE_*` env vars.

### Tests / "lint"
- There is no ESLint/Prettier/TypeScript step and no `lint`/`test` npm script. The repo's
  automated checks are the ~140 `verify:*` scripts in `package.json`. Scripts named
  `verify:*` (e.g. `verify:procurement-order-actions`) are static and run without Docker;
  scripts under `supabase:local:*` require a running local Supabase (Docker).
- Playwright (`test:e2e:recruitment*`) targets deployed staging/production URLs by default,
  not localhost — treat it as optional here.
