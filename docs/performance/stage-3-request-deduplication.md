# Stage 3 — Request deduplication (Variant A)

**Date:** 2026-07-18  
**Runtime commit:** `c419635` (`perf(data): deduplicate workforce employees and rbac requests`)  
**Production URL:** `https://dakeci-lab.github.io/shugyla-academy/`  
**Scope:** Frontend only — in-flight coalesce + effect/remount hygiene.  
**Out of scope:** SQL/migrations, Edge redeploy, RLS/indexes, lazy routes, React Query, tracker/Realtime.

## Target vs result (S2-F03)

| Surface | Before (Stage 2) | After (Stage 3 prod median) |
|---------|------------------|-----------------------------|
| Home `admin-team-workforce-data` | ×2 | **×1** |
| Employees `admin-list-employees` | ×7 | **×1** |
| Employees RBAC catalog waves | ×7–8 | **×1** per full reload (no extra waves) |
| Profile `admin-list-employees` | ×6–7 | **×1** (direct lookup path) |
| Profile full list | implied by storm | **0 extra** beyond that single invoke |
| Profile workforce (schedule block) | ×1 | **×1** |
| Schedule workforce | ×1 | **×1** (not worsened) |

## Root causes fixed

1. **Home ×2** — `OwnerDashboard` `loadData` depended on `employeeIdsKey` derived from `teamEmployees`; cloud fetch updated that key and re-ran the effect.
2. **Employees / Profile storms** — network effects depended on AcademyData `version`, bumped by progressive bootstrap `notifyModulesChanged`.
3. **RBAC ×N** — `getRolesForEmployeeForm` delegated to adapter `loadRbacSnapshot()`, bypassing `ensureRbacLoaded`.
4. **No Edge coalesce** — concurrent identical invokes were not shared (defense in depth).

## Changes

- `src/lib/requestCoalesce.js` — shared in-flight map; cleared on logout and `SIGNED_OUT`.
- `listEmployeesForAdmin` / `fetchTeamWorkforceData` — session-scoped coalesce keys.
- `OwnerDashboard` — cloud path ignores employee-id key feedback.
- `EmployeesSection` / `EmployeeProfileSection` — drop `version` from network load effects.
- `rbacService.getRolesForEmployeeForm` / `getActiveRolesForAssignment` — route through `ensureRbacLoaded`.
- Logout / `SIGNED_OUT` — `invalidateRbacCache` + `clearInFlightRequests` (+ bootstrap reset).

## Coalescing contract

| Rule | Behavior |
|------|----------|
| Key | `admin-list-employees:{userId}:{JSON body}` / `admin-team-workforce-data:{userId}:{from}:{to}:{view}` |
| Different filters / employeeId / periods | Different keys → no merge |
| Lifetime | In-flight only; entry deleted in `finally` (success and error) |
| Retry | New call after settle creates a new network request |
| Not a cache | Completed results are not retained |
| Session isolation | `userId` in key; logout/`SIGNED_OUT` clears map + RBAC cache |
| Mutations | Explicit `loadCloudEmployees` / `loadEmployee` still re-fetch |

## Production median (3 runs each, Resource Timing, authenticated admin)

**Method:** Cursor Browser, full navigations to each URL after deploy of `c419635`. No HAR saved. Counts = matching resource names on `*.supabase.co`. Profile “direct lookup” counted as single `admin-list-employees` invoke (body not visible in Resource Timing; code path uses `employee_id` + `pageSize: 1`).

| Route | Metric | Run1 | Run2 | Run3 | Median |
|-------|--------|------|------|------|--------|
| Home `/platform` | workforce count | 1 | 1 | 1 | **1** |
| Home | workforce `responseEnd` | 5066 | 6125 | 6031 | **~6031 ms** |
| Home | RBAC roles/permissions/role_permissions | 1/1/1 | 1/1/1 | 1/1/1 | **1 each** |
| Home | purchase/receiving | 0 | 0 | 0 | **0** |
| Employees list | list Edge count | 1 | 1 | 1 | **1** |
| Employees list | list `responseEnd` | 5792 | 4211 | 3633 | **~4211 ms** |
| Employees list | RBAC quartet | 1 each | 1 each | 1 each | **1 each** |
| Profile `/employees/10` | list Edge | 1 | 1 | 1 | **1** |
| Profile | workforce | 1 | 1 | 1 | **1** |
| Profile | list / wf end | 4069 / 8003 | 3460 / 8610 | 3542 / 6834 | **~3542 / ~8003 ms** |
| Schedule | workforce count | 1 | 1 | 1 | **1** |
| Schedule | workforce end | 5882 | 4929 | 5924 | **~5882 ms** |

**Stage 2 baselines (for compare):** Home workforce ×2, Home ready ~8945 ms; Employees list ×7; Profile list ×6–7; Schedule workforce ×1 (~3.4–4.4 s).

## Measurement limits

- Cross-origin Resource Timing often exposes duration/`responseEnd` but not request body — cannot prove `employee_id` vs page list from Network name alone.
- Full reload always performs one RBAC snapshot; “no extra waves” means multiplicity stayed at 1, not zero REST calls.
- Single admin role; no TOKEN_REFRESHED during series.
- Warm CDN/browser variance affects wall-clock more than counts.

## Remaining bottlenecks (not Stage 3)

| ID | Issue | Suggested stage |
|----|--------|-----------------|
| F-06 / Variant E | Single `admin-team-workforce-data` still ~5–8 s | **Stage 4** |
| S2-F01 / F-07 | Monolith JS ~1.35 MB | later (lazy) |
| Academy REST fanout | `academy_users` ×3 etc. | later |
| Procurement initial PO/RD ×2 + poll | mild | later |

## Recommended Stage 4

**Variant E — narrow `admin-team-workforce-data`** (payload / date window / view-specific columns) so one Home/Schedule call is fast. Do not combine with RLS/index work unless measured separately.

## Verify

```bash
npm run verify:request-deduplication
npm run verify:home-dashboard
npm run verify:employees-list
npm run verify:progressive-bootstrap
npm run verify:app-bootstrap
npm run verify:employee-schedule-weekly-open
npm run verify:time-tracker-checkout-ui
npm run verify:stale-shift-release
npm run verify:platform-mobile-drawer
npm run verify:procurement-cross-device-sync
npm run build
```
