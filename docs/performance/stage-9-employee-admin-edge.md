# Stage 9 — Employee Admin Edge Latency

## Executive summary

Stage 9 reduces latency of the single `admin-list-employees` Edge invocation used by Employees List and direct Employee Profile lookup.

**Status: успешно.**

| Metric | Before (SPA warm) | After (SPA warm) | Change |
|---|---|---|---|
| Employees Resource median | 1940 ms | 974 ms | −50% |
| Employees Resource min/max | 1714 / 1999 ms | 840 / 1209 ms | — |
| Profile direct Resource median | 2118 ms | 1119 ms | −47% |
| PostgREST DB calls (list/direct) | 3 (code path) | 2 (measured) | −1 |
| Frontend invoke count | ×1 | ×1 | unchanged |

No SQL migrations, RPC, RLS, index, or Home/workforce changes. Redeployed only `admin-list-employees` (script size ~737 kB). Runtime commit: `5e07484`.

## Stage 3 historical baseline

After Stage 3 request coalescing:

- `/platform/employees/list` ready was historically ~4.0–5.7 s under duplicate storms;
- after storms removed: `admin-list-employees` invoke count ×1;
- Employee Profile direct lookup ×1; full-list duplicates 0.

Stage 9 remeasured a fresh production baseline before code changes (see below). Current warm Resource was already ~1.7–2.0 s — better than the Stage 3 historical ready window — but still paid **3 PostgREST round-trips** inside the Edge.

## Current production baseline (pre-Stage 9)

Measured 2026-07-18 on production SPA (`dakeci-lab.github.io`), Resource Timing for `admin-list-employees` only. No Server-Timing / DB-call headers were available on the previous deploy.

### Employees List — 7 SPA warm runs

| Run | Resource ms | Invoke |
|---|---:|---:|
| 1 | 1940 | 1 |
| 2 | 1990 | 1 |
| 3 | 1894 | 1 |
| 4 | 1714 | 1 |
| 5 | 1999 | 1 |
| 6 | 1744 | 1 |
| 7 | 1984 | 1 |

- **median:** 1940 ms  
- **min/max:** 1714 / 1999 ms  
- transferSize opaque (0) in Resource Timing; body size not readable without header expose on old build.

### Cold / full reload (separate)

- Resource: **2455 ms**, invoke ×1.

### Direct Employee Profile — 5 runs

| Run | Resource ms | Invoke |
|---|---:|---:|
| 1 | 2931 | 1 |
| 2 | 1881 | 1 |
| 3 | 2032 | 1 |
| 4 | 2118 | 1 |
| 5 | 2322 | 1 |

- **median:** 2118 ms  
- **min/max:** 1881 / 2931 ms  

### Pre-change call graph (code)

| Step | PostgREST call | Sequential | Required | Mergeable |
|---|---|---|---|---|
| Bearer extract | no | yes | yes | — |
| `getClaims` / fallback `getUser` | no (Auth) | yes | yes | — |
| `loadCallerProfile` | yes (#1) | yes | yes | with permissions |
| `roleHasPermissionCodes` | yes (#2) | yes | yes | with caller |
| employees `SAFE_EMPLOYEE_SELECT` + count | yes (#3) | yes | yes | keep separate |
| `mapSafeEmployee` transform | no | yes | yes | — |

**Authorization DB calls before:** 2  
**Data DB calls before:** 1  
**Total PostgREST before:** 3  

No per-employee loop queries. Role/avatar/status already on `academy_users` columns (no separate roles/profiles queries). Direct mode already used `.eq('id', employeeId)` — not a full-list fallback.

## Authorization path

Reused Stage 6/8 fusion via new `authorizeEmployeeAdminRequest`:

1. Bearer once  
2. Official `supabase.auth.getClaims(bearer)` with `getUser(bearer)` fallback  
3. One relational PostgREST query (`CALLER_AUTHZ_SELECT`)  
4. Server-fixed permission `employees.view`  
5. Empty nested permission result → 403  
6. Inactive caller → 403  
7. Request-scoped context only (no cross-request cache)

`authorizeEmployeeAdmin` now wraps the same fused helper for other admin Edges when they are redeployed later; workforce behavior unchanged (`authorizeWorkforceRequest` untouched).

## List data path

Single PostgREST query:

```text
academy_users
  select SAFE_EMPLOYEE_SELECT (count exact)
  .neq('role', 'admin')
  optional status / role_id / search filters
  order sort_by, id
  range page
```

## Direct lookup path

Same select/transform contract with:

```text
.eq('id', employeeIdFilter)
```

Empty → `employee_not_found` (404). No full-list load.

## Relations and FK names

Authorization fusion:

```text
roles!academy_users_role_id_fkey(
  role_permissions(
    permissions!inner(code)
  )
)
```

List/direct employee rows do **not** nest roles — `role` / `role_id` are columns on `academy_users`.

## Fused authorization

| Before | After |
|---|---|
| caller mapping query | merged |
| permission codes query | merged |
| Authorization DB calls = 2 | Authorization DB calls = 1 |

Required permission: **`employees.view`** (server-fixed).

## Fused list query

List data was already one query. Stage 9 kept that query; win is authz fusion + observability headers.

## Direct query

Unchanged workload shape; still one data query with `employee_id` filter. Response still wraps a one-element `employees` array + pagination (contract preserved).

## Request-scoped context

`RequestAuthzContext` carries `serviceClient`, `caller`, `authUserId`, `authMethod`, `permissions`, `dbCalls`, timings. Never module-scoped.

## Security

| Check | Result |
|---|---|
| 401 missing/invalid JWT | preserved |
| 403 missing permission / inactive | preserved |
| Permission from body ignored | body keys allowlist; no permission field |
| Organization / admin exclusion | `.neq('role', 'admin')` retained |
| Cross-request auth cache | absent |
| Service role on frontend | absent |

## DB-call counter

Header: `X-Employee-Admin-DB-Calls`  
CORS expose: `x-employee-admin-db-calls`  
Counts PostgREST round-trips only (not JWKS local verify).

Budget achieved: **list = 2, direct = 2**.

## Server-Timing

Phases (duration only): `token`, `auth`, `authorization_db`, `authorization`, `employees_db`, `transform`, `serialize`, `total`.

## Response contracts

Unchanged top-level:

```json
{ "ok": true, "employees": [...], "pagination": { "page", "page_size", "total", "total_pages" } }
```

Employee fields via `mapSafeEmployee` (including `auth_linked`). Direct not-found remains 404 `employee_not_found`.

## Mutation refresh

Frontend unchanged: modal create/update in `EmployeeEditModal`; list refresh via explicit `loadCloudEmployees` / profile `loadEmployee`. Stage 3 coalescing keys retained (`admin-list-employees:${sessionUserId}:${JSON.stringify(body)}`).

## Before/after Employees timing

| | Before | After |
|---|---:|---:|
| Resource median | 1940 | 974 |
| Resource min/max | 1714 / 1999 | 840 / 1209 |
| Edge total median | n/a | 618 |
| authorization_db median | n/a | 285 |
| employees_db median | n/a | 281 |
| auth median | n/a | 36 |
| DB calls | 3 (code) | 2 |
| rows | ~10 visible | 10 |
| response bytes | n/a | 4064 |

Cold after deploy (full reload, separate): Resource **3920 ms** (not mixed into SPA median).

## Before/after Profile timing

| | Before | After |
|---|---:|---:|
| Resource median | 2118 | 1119 |
| Resource min/max | 1881 / 2931 | 953 / 1415 |
| Edge total median | n/a | 648 |
| DB calls | 3 (code) | 2 |
| rows | 1 | 1 |
| full-list invokes | 0 | 0 |
| response bytes | n/a | ~424–540 |

## Tests

- `verify:employee-admin-edge-performance` — 47/47  
- `verify:request-deduplication`, `verify:employees-list`, workforce Stage 6/8 verifies, progressive/app bootstrap, home, time-tracker, drawer, procurement — pass  
- `verify:auth-first-frontend-production-readiness` Stage 4 updated for `EmployeeEditModal` create/update (stale `EmployeesSection.createEmployee(payload)` expectation removed); static stages pass; local Docker auth matrix skipped/failed in this environment (Docker unavailable)  
- `verify:employee-create-fix` — pre-existing failure (`html minLength uses shared constant`); unrelated to Stage 9  
- `npm run build` — pass  

## Rollback

```bash
# Redeploy previous admin-list-employees bundle from commit before 5e07484
git checkout c5a16a5 -- supabase/functions/admin-list-employees supabase/functions/_shared/employeeAuthorization.ts supabase/functions/_shared/cors.ts
npx supabase functions deploy admin-list-employees --project-ref cxadzerxndlscwvdaymk
```

Or redeploy from the last known-good Edge artifact in Supabase dashboard.

## Remaining bottleneck

Edge `total` median ~618 ms; Resource median ~974 ms. Gap is mostly **network + Edge cold/connect overhead**. Inside Edge, each PostgREST phase is still ~270–290 ms RTT (same class as Stage 7/8 workforce finding). SQL itself is not the limiter.

## Recommended Stage 10

Do **not** add employee-list RPC yet unless Resource stalls above product targets after further Edge hardening.

Candidates (pick one):

1. **Edge region / keep-warm** for `admin-list-employees` if cold spikes dominate UX.  
2. **Optional lean SELECT** for list-only (drop unused `created_at`/`updated_at` if product confirms) — small payload win only.  
3. **Next product bottleneck outside employees** (e.g. RBAC catalog, procurement) once Employees Resource stays ≤1.0–1.2 s warm.
