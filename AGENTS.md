# AGENTS.md

Project overview and architecture live in `CLAUDE.md` (Russian). Read it first for
domain/architecture context. This file adds operational notes for agents.

## Cursor Cloud specific instructions

Runtime: Node 22 + npm (lockfile is `package-lock.json` — use `npm`, not pnpm/yarn).
Dependencies are refreshed automatically by the startup update script (`npm install`).

### Running the app (primary dev path — no external services)

- `npm run dev` serves the SPA at http://localhost:5173.
- With **no** `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set, the app runs in
  **local mode** (`src/lib/dataMode.js`): all data comes from localStorage via the
  `*LocalAdapter.js` services, so it is fully usable without Supabase/Docker.
- Local-mode demo logins live in `src/data/users.js` (e.g. `admin` / `admin123` = admin,
  `zakup` / `123456` = buyer). After login you land on `/platform`.
- On `localhost` the router serves the COMBINED surface (all of corporate + platform +
  careers), so `/platform/*`, `/vacancies`, and `/apply` are all reachable from one server.

### Build

- `npm run build`. In dev/`serve` the base path is `/`, but a plain build defaults the
  base to `/shugyla-academy/` (GitHub Pages fallback). For a locally-served build pass
  `APP_BASE_PATH=/ npm run build`. Chunk-size (>500 kB) warnings from pdfmake/xlsx are
  expected and benign.

### Lint / tests

- There is **no lint step** (no ESLint config, no `lint` script in `package.json`).
- Tests are ~140 self-written `verify:*` node scripts in `scripts/` (see `package.json`).
  Scripts named `verify:*` (and `--static-only` variants) are static/offline and run with
  just `node` — e.g. `npm run verify:procurement-abc-analysis`.
- Scripts named `supabase:local:verify-*`, `tt:production:*`, and the Playwright e2e
  (`npx playwright test`, `test:e2e:recruitment*`) require external services and are NOT
  runnable from a clean clone (see below).

### Cloud mode / Supabase local (OPTIONAL — not set up by default)

Only needed to exercise the `*SupabaseAdapter.js` code paths, Edge Functions, or the
`supabase:local:verify-*` scripts. Requires extra tooling not installed by the update
script: Docker (daemon running), the Supabase CLI (`npx supabase`), and Deno for Edge
Functions. Bootstrap with `npm run supabase:local:bootstrap -- --reset` (see
`docs/local-development/supabase-bootstrap.md`). UMAG-integration functions additionally
need real `api.umag.kz` credentials, which are never committed. Skip all of this for
normal frontend development — local mode covers it.
