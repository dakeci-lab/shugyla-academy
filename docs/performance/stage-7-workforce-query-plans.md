# Stage 7 — Workforce database query-plan audit

**Date:** 2026-07-18  
**Commits audited:** Stage 6 runtime `cca3b65`, docs `b70c630`  
**Project:** `cxadzerxndlscwvdaymk`  
**Nature:** diagnostic only — no indexes, migrations, RLS changes, Edge redeploy, or runtime edits.

## 1. Executive summary

PostgreSQL execution for employee mapping, permission lookup, and shifts is **sub‑millisecond to ~2 ms**. Edge Server-Timing phases for the same work remain **~270–290 ms** each. The gap is **PostgREST / network round-trip overhead**, not missing indexes or RLS predicates on the Edge path.

**Recommended Stage 8:** Variant E — **round-trip reduction** inside `admin-team-workforce-data` (fewer sequential service-role PostgREST calls), not a new index.

## 2. Stage 6 baseline (context)

| Metric | After Stage 6 |
|--------|--------------:|
| Home Resource median | 1707 ms |
| Auth warm | ~46 ms |
| Employee mapping (Edge) | ~280 ms |
| Permissions (Edge) | ~270 ms |
| Edge total | ~1166 ms |
| Request count | ×1 |
| Payload | ~1.4 KB |

## 3. Query inventory

All DB queries in this Edge function use **`serviceClient`** (`SUPABASE_SERVICE_ROLE_KEY`). JWT is verified separately via `userClient.auth.getClaims` / `getUser`; workforce SQL does **not** run as `authenticated`.

### Query A — Employee mapping

```text
from('academy_users')
  .select('id, status, role, role_id, auth_user_id')
  .eq('auth_user_id', <verified auth uid>)
  .maybeSingle()
```

No organization column filter (single-tenant mapping). Status checked in application code after fetch (`canEmployeeLogin`).

### Query B — Permission lookup (preferred path)

```text
from('permissions')
  .select('code, role_permissions!inner(role_id)')
  .in('code', uniqueCodes)          // server-fixed per view
  .eq('role_permissions.role_id', roleId)
```

| View | Codes |
|------|-------|
| home-summary / dashboard | `schedule.view_team` |
| schedule | `schedule.view_team`, `schedule.view_own` |
| rating | `rating.view`, `schedule.view_team` |

Fallback (if embed fails): two queries — `permissions` by code, then `role_permissions` by `role_id` + permission ids.

### Query C — Shifts / Home employees

**Home (`home-summary`):**

```text
from('academy_employee_shifts')
  .select(HOME_SUMMARY_SHIFT_SELECT)
  .eq('shift_date', dateFrom)
  .order('employee_id')

from('academy_users')
  .select(HOME_SUMMARY_EMPLOYEE_SELECT)
  .in('id', shiftIds)
  .neq('role', 'admin')
  .eq('status', 'active')
  .order('full_name').order('id')
```

**Profile (scoped):** employees + shifts with `employee_id = scopedId`, date range gte/lte (month bundle).

**Schedule (team week):** active non-admin employees (full team), shifts gte/lte week, optionally `.in('employee_id', ids)`.

## 4. Database role and RLS path

| Item | Evidence |
|------|----------|
| Client | `createClient(url, SUPABASE_SERVICE_ROLE_KEY, …)` in `employeeAuthorization.ts` |
| PostgreSQL role | `service_role` (bypasses RLS) |
| RLS enabled on tables | yes (`relrowsecurity = true`) for all five tables |
| RLS in Edge query plan | **no** — service role bypass; authorization already done before workforce SQL |
| User JWT client | only for Auth verification, not for A/B/C |

**Conclusion:** Stage 7 must not propose RLS rewrite for this bottleneck.

## 5. Table sizes

| Table | live rows | table | indexes | total | last autoanalyze |
|-------|----------:|------:|--------:|------:|------------------|
| academy_users | 19 (12 active) | 16 kB | 64 kB | 112 kB | 2026-07-14 |
| academy_employee_shifts | 210 | 40 kB | 64 kB | 136 kB | 2026-07-18 |
| permissions | 51 | 16 kB | 48 kB | 96 kB | 2026-07-16 |
| role_permissions | 138 | 16 kB | 48 kB | 88 kB | 2026-07-13 |
| roles | 9 | 8 kB | 64 kB | 80 kB | null |

Tables are tiny; planner may choose Seq Scan even when a usable index exists.

## 6. Existing indexes (relevant)

| Table | Index | Definition (summary) | idx_scan (approx) |
|-------|-------|----------------------|------------------:|
| academy_users | `idx_academy_users_auth_user_id_unique` | UNIQUE `(auth_user_id) WHERE NOT NULL` | ~37k |
| academy_users | `academy_users_pkey` | UNIQUE `(id)` | ~12k |
| academy_users | `idx_academy_users_role_id` | `(role_id)` | low |
| permissions | `permissions_code_key` | UNIQUE `(code)` | ~2.8k |
| role_permissions | `role_permissions_pkey` | UNIQUE `(role_id, permission_id)` | ~2.5k |
| role_permissions | `idx_role_permissions_role` / `_permission` | single-column | used |
| shifts | `idx_employee_shifts_date` | `(shift_date)` | ~10k |
| shifts | `idx_employee_shifts_employee_date` | `(employee_id, shift_date)` | ~2k |
| shifts | unique `(employee_id, shift_date)` | constraint index | used |

**Missing-index hypothesis for Stage 7:** not supported — required keys already indexed.

## 7. Employee mapping plan

Plain `EXPLAIN` (InitPlan form) may show **Seq Scan** on 19-row `academy_users` (cost ~2.3).  
`EXPLAIN ANALYZE` (semi-join / InitPlan forms):

| Metric | Value |
|--------|------:|
| Planning | ~1.0–1.3 ms |
| Execution | **0.14–0.79 ms** |
| Actual rows | 1 |
| Buffers | shared hit only (4–6) |
| Scan | Seq Scan acceptable at this cardinality; unique auth_user_id index heavily used in production (`pg_stat`) |

## 8. Permission lookup plan

| Metric | Value |
|--------|------:|
| Plan | Nested Loop |
| permissions | Index Scan `permissions_code_key` |
| role_permissions | Index Only Scan `role_permissions_pkey` |
| Planning | ~1.3 ms |
| Execution | **0.133 ms** |
| Rows | 1 |
| Buffers | shared hit 6 |

## 9. Home shifts plan

| Metric | Value |
|--------|------:|
| Plan | Index Scan `idx_employee_shifts_date` + Sort `employee_id` |
| Estimated / actual rows | 10 / 10 |
| Planning | ~3.6 ms |
| Execution | **0.176 ms** |
| Buffers | shared hit 9 |

## 10. Profile shifts plan

| Metric | Value |
|--------|------:|
| Plan | Index Scan `idx_employee_shifts_employee_date` |
| Actual rows | 3 (sample employee / ±15 days) |
| Execution | **1.939 ms** |

## 11. Schedule shifts plan

| Metric | Value |
|--------|------:|
| Plan | Index Scan `idx_employee_shifts_date` + Incremental Sort |
| Actual rows | 64 (week) |
| Execution | **0.857 ms** |

## 12. Edge timing vs SQL execution

Production Edge baseline for this audit (Home SPA, n=7):

| Phase | median ms | min / max |
|-------|----------:|-----------|
| Resource | 1752 | 1415 / 2846 |
| auth | 39 | 32 / 85 |
| employee | 291 | 273 / 772 |
| permissions | 275 | 261 / 840 |
| authorization | 572 | 534 / 1540 |
| employees | 276 | 261 / 284 |
| shifts | 277 | 265 / 762 |
| transform | 0 | 0 / 0 |
| Edge total | 1209 | 1133 / 2600 |

Schedule (n=3): Resource median 1547; shifts 284; employees 278; total 1180.  
Profile (n=3 workforce calls on `/employees/:id`): Resource samples 2398 / 1394 / 1935 (median **1935**); shifts samples 770 / 288 / 762 (median **762**, high variance).

| Query | Edge Server-Timing median | SQL execution | Difference |
|-------|--------------------------:|--------------:|-----------:|
| Employee mapping | 291 ms | ~0.1–0.8 ms | **~290 ms** |
| Permissions | 275 ms | ~0.13 ms | **~275 ms** |
| Home shifts | 277 ms | ~0.18 ms | **~277 ms** |
| Profile shifts | ~762 ms* | ~1.9 ms | **~760 ms*** |
| Schedule shifts | 284 ms | ~0.86 ms | **~283 ms** |

\*Profile Edge `shifts` median dominated by outliers; warm sample 288 ms aligns with Home/Schedule RTT band.

**Interpretation:** SQL is not the bottleneck. Each sequential PostgREST call costs ~250–300 ms wall time from the Edge region even when Postgres finishes in &lt;2 ms.

## 13. pg_stat_statements

Available. Representative PostgREST fingerprints (means):

| Fingerprint (truncated) | calls | mean_ms |
|-------------------------|------:|--------:|
| SELECT academy_users id/status/auth_user_id | 3640 | **0.081** |
| SELECT academy_users id/status/role/role_id… | 2078 | **0.068** |
| SELECT permissions by code | 2609 | **0.142** |
| SELECT role_permissions by role_id + permission_id | 2597 | **0.150** |
| SELECT academy_employee_shifts (narrow) | 3640 | **0.467** |
| SELECT academy_employee_shifts by shift_date | 1441 | **2.179** |

Confirms DB mean times are far below Edge phase medians. No query fingerprint shows ~270 ms mean inside Postgres.

## 14. Query Performance and Logs

Supabase Advisors were **not** auto-applied. CLI `db query --linked` used for catalogs/`EXPLAIN`. Dashboard Query Performance not required beyond `pg_stat_statements` evidence above.

## 15. Cardinality

Estimated vs actual closely matched (Home shifts 10/10; permissions 1/1; schedule week 65 est / 64 act). No stale-stats crisis. Manual `ANALYZE` not recommended in Stage 7.

## 16. Type / expression issues

| Hypothesis | Result |
|------------|--------|
| UUID vs text mismatch blocking auth_user_id index | **Not confirmed** as latency cause; table tiny; index heavily used historically |
| Function-wrapped column preventing index on shifts | Date filter uses `shift_date = date` / range — **Index Cond** present |
| ORDER BY mismatch | Home uses Sort after index on date — cheap (25 kB) |
| Relational filter after JOIN | Permissions Nested Loop uses index conditions on both sides |

## 17. Findings

### F-S7-01 — PostgREST round-trip dominates Edge DB phases

- **Query:** A / B / C  
- **Edge phase:** employee / permissions / shifts ~270–290 ms median  
- **SQL planning / execution:** ~1–4 ms / **&lt;2 ms**  
- **Scan / index:** appropriate for size; indexes exist  
- **RLS:** bypassed (service_role)  
- **Table size:** tiny (19–210 rows)  
- **Root cause:** sequential HTTP PostgREST round-trips from Edge → DB API  
- **Evidence:** EXPLAIN ANALYZE + pg_stat mean ≪ Server-Timing; consistent ~270 ms band across unrelated tables  
- **Priority:** P1 (blocks further Home latency gains on this function)  
- **Confidence:** high  
- **Proposed change (Stage 8 only):** reduce number of sequential service-role round-trips (e.g. combine caller+permissions validation, or single RPC/SQL function returning authz+home payload) **without** weakening JWT verification  
- **Expected effect:** cut ~250–500+ ms from Edge total if 1–2 round-trips removed  
- **Risk:** medium (must preserve 401/403, view codes, scopes)  
- **Migration:** only if RPC chosen; prefer Edge-only coalesce first  
- **Edge deploy:** yes for Stage 8  
- **Verify / rollback:** Server-Timing phase medians; redeploy previous function

### F-S7-02 — Seq Scan on academy_users mapping is not a P1

- Tiny table (19 rows); execution &lt;1 ms  
- Unique partial index already exists and is used in production stats  
- **Do not** add another auth_user_id index for Stage 8

### F-S7-03 — Shifts indexes already cover Home/Profile/Schedule

- Home: `idx_employee_shifts_date`  
- Profile: `idx_employee_shifts_employee_date`  
- Schedule week: date index + cheap incremental sort  
- **Do not** create `(shift_date, employee_id)` solely for ORDER BY at this volume

## 18. What is not a bottleneck

- JWT verification (warm auth ~39 ms)  
- Transform (0 ms)  
- Missing indexes on A/B/C predicates  
- RLS policy cost on this Edge path  
- Payload size / home-summary row counts  
- PostgreSQL execution time itself

## 19. One recommended Stage 8

**Variant E — round-trip reduction** for `admin-team-workforce-data`.

**Why:** SQL plans are already fast; each remaining ~270 ms phase is almost entirely RTT. An index or query rewrite cannot remove that overhead.

**Not chosen:**

- Variant C (index) — no high SQL execution / Seq Scan problem at scale  
- Variant B (rewrite for join order) — Nested Loop already index-backed and &lt;1 ms  
- No DB change → jump to `admin-list-employees` — valid later, but Stage 8 should first harvest the proven RTT waste on this hot path

## 20. Risks and rollback

Stage 7 made **no** production changes. Stage 8 must keep JWT verification, service-role scope, and view-specific permission codes; rollback = redeploy prior Edge bundle.

## 21. Access limitations

- No Supabase MCP; used `npx supabase db query --linked`  
- Advisors UI not applied  
- Profile UI automation flaky (list→card); three workforce samples still captured via `/employees/:id`  
- Cold full-page Home reload not re-measured in this audit; SPA warm n=7 used  
- `EXPLAIN ANALYZE` InitPlan forms may prefer Seq Scan on 19-row tables — does not imply missing index for production constant-equality lookups

## 22. Audit SQL files

- `scripts/performance/stage7-table-stats.sql`  
- `scripts/performance/stage7-index-inventory.sql`  
- `scripts/performance/stage7-explain-employee.sql`  
- `scripts/performance/stage7-explain-permissions.sql`  
- `scripts/performance/stage7-explain-shifts.sql`
