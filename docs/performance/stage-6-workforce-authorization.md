# Stage 6 — Workforce Edge authorization latency

**Date:** 2026-07-18  
**Runtime commit:** `cca3b65` (`perf(authz): reduce workforce edge authorization latency`)  
**Edge:** `admin-team-workforce-data` redeployed to `cxadzerxndlscwvdaymk` (~740 kB)  
**Out of scope:** RLS, indexes, migrations, RPC, bundle split, Academy, `admin-list-employees`, cross-request authz cache, Stage 5 `home-summary` contract changes.

## 1. Executive summary

Stage 5 cut Home workforce payload/workload, but Server-Timing still spent most of the Edge budget on Auth + authorization. Stage 6 collapses that path into a request-scoped context: one JWT verification (`auth.getClaims` with `getUser` fallback), one employee mapping, one minimal permission query (view-specific codes), and finer Server-Timing phases. Production Home Resource Timing median fell from **3286 ms** (Stage 5 published) to **1707 ms** (−48%), with Edge `total` median **1166 ms**.

## 2. Stage 5 baseline

| Metric | Value |
|--------|------:|
| Home workforce count | ×1 |
| Resource Timing median / min / max | 3286 / 2718 / 5172 ms |
| Payload | ~1.4 KB |
| Employees / shifts (home-summary) | ~9 / ~9 |
| Procurement / Receiving on Home | 0 |

Fresh SPA warm phase baseline **immediately before Stage 6 deploy** (n=5, same session style as after):

| Phase | median ms |
|-------|----------:|
| Resource Timing | 2803 |
| auth (getUser + employee mapping) | 614 |
| authorization (2 permission queries) | 1025 |
| employees | 266 |
| shifts | 267 |
| transform | 0 |
| Edge total | 2179 |

## 3. Auth flow before

```text
Bearer header
→ create userClient + serviceClient
→ userClient.auth.getUser()          // remote Auth round-trip every call
→ academy_users by auth_user_id      // employee mapping
→ return { serviceClient, caller }
```

Timed as a single `auth` phase (verification + mapping).

## 4. Authorization flow before

```text
roleHasPermissionCodes(role_id, [team, own, rating])  // always 3 codes
→ SELECT permissions WHERE code IN (...)
→ SELECT role_permissions WHERE role_id = ? AND permission_id IN (...)
→ resolveWorkforceScope(view, flags)
```

Timed as `authorization` (permissions only). Two sequential DB round-trips.

## 5. Internal query inventory (before)

| Step | Operation | Sequential | Required | Reusable |
|------|-----------|------------|----------|----------|
| 1 | Extract Bearer | yes | yes | once |
| 2 | `createClient` user + service | yes | yes | once / request |
| 3 | `auth.getUser()` | yes | yes | once |
| 4 | `academy_users` select | yes | yes | once |
| 5 | `permissions` by codes | yes | yes | once |
| 6 | `role_permissions` by ids | yes | yes | once |
| 7 | shifts / employees workforce | after authz | yes | — |

## 6. Server-Timing baseline

See §2. No invented values; `token` / `employee` / `permissions` were not separate phases before Stage 6.

## 7. Duplicate Auth checks

Before: one `getUser` per request (good), but no local claims verification. Authorization helper always re-fetched three permission codes even for `home-summary` (only needs `schedule.view_team`). No second `getUser` inside permission helpers.

## 8. Employee mapping

Single `academy_users` select: `id, status, role, role_id, auth_user_id`. Status gate via `canEmployeeLogin`. No `select('*')`. Mapping result lives only on the returned request context.

## 9. Permission lookup

After: prefer one relational query:

```text
permissions.select('code, role_permissions!inner(role_id)')
  .in('code', uniqueCodes)
  .eq('role_permissions.role_id', roleId)
```

Fallback: previous 2-query path if embed fails. Codes are server-fixed per view (`permissionCodesForView`); body cannot supply permissions.

## 10. Request-scoped context

`authorizeWorkforceRequest` returns `{ serviceClient, caller, authUserId, authMethod, permissions, timings }`. Created per invocation, never module-level, never cross-request cached, not logged as a whole.

## 11. Security model

- JWT verified via official SDK `getClaims(bearer)` (JWKS / WebCrypto for asymmetric keys).
- Symmetric / unavailable path: SDK or explicit `getUser(bearer)` fallback — no unsigned decode.
- 401 missing/invalid token; 403 inactive / missing profile / missing permission; own-scope cannot request another employee; organization/team rules unchanged (single-tenant academy_users mapping).
- Role/permission changes apply on the next request (no TTL cache).

## 12. Implementation

- `supabase/functions/_shared/employeeAuthorization.ts` — `verifyBearerAuthUserId`, `loadCallerProfile`, `authorizeWorkforceRequest`, relational `roleHasPermissionCodes`
- `supabase/functions/admin-team-workforce-data/index.ts` — view-specific codes + expanded Server-Timing
- `scripts/verify-workforce-edge-authorization-performance.mjs`
- Verify/package wiring updates

## 13. Server-Timing after

Phases: `token`, `auth`, `employee`, `permissions`, `authorization` (= employee+permissions), `employees`, `shifts`, `transform`, `total`. Durations only; CORS expose unchanged.

## 14. Production median before/after

**Comparable SPA warm Home samples (n=5) after Edge redeploy:**

| Metric | Before (pre-deploy SPA) | After Stage 6 | Δ |
|--------|------------------------:|--------------:|--:|
| Resource Timing median | 2803 | **1707** | −39% |
| Resource min / max | 2183 / 2853 | 1435 / 3981 | — |
| auth | 614 (mixed) | **46** | −92% |
| employee | (inside auth) | **280** | — |
| permissions | (inside authorization) | **270** | — |
| authorization | 1025 (perms only) | **557** (emp+perms) | see note |
| Edge total | 2179 | **1166** | −46% |
| employees / shifts / transform | 266 / 267 / 0 | 276 / 273 / 0 | ~flat |
| Payload encoded | ~1398 | ~1398 | 0 |
| Request count | ×1 | ×1 | 0 |

vs **Stage 5 published** Resource median 3286 → **1707** (−48%). Target ≤2500 or ≥20%: **met**.

Note: Stage 6 `authorization` includes employee mapping; Stage 5 `authorization` was permissions-only. Fair permissions comparison: **1025 → 270 ms** (−74%). Fair auth verification: old auth≈614 included mapping; new `auth+employee`≈326 ms, with verification alone **~46 ms** (JWKS warm).

First after-deploy sample showed `auth=324` (cold JWKS), then 35–49 ms — consistent with `getClaims` + edge JWKS cache.

## 15. Security tests

Covered structurally by `verify:workforce-edge-authorization-performance` (401/403 paths, own vs team, no body permissions, no global cache, inactive caller, contracts). Live session: permitted admin Home returned 200 + metrics; unauthorized paths not mutated in production.

## 16. Regression tests

`verify:home-workforce-summary`, `verify:workforce-edge-performance`, `verify:request-deduplication`, bootstrap/home/employees/schedule/tracker/drawer/procurement verifies, `npm run build` — passed before commit.

## 17. Remaining bottleneck

After Stage 6, Edge median total ~1.2 s. Remaining cost is mostly sequential DB: employee mapping (~280) + permissions (~270) + home shifts/employees (~270 each). Resource Timing still adds network/TLS variance (one warm sample 3981 ms). Auth verification is no longer the dominant phase when JWKS is warm.

## 18. Recommended Stage 7

Query-plan audit for `academy_users` by `auth_user_id` and `permissions`/`role_permissions` relational select (EXPLAIN only — no index without evidence). Optionally revisit home-summary shift→employee sequencing if plans show clear win. Do **not** add cross-request authz cache or weaken JWT verification.
