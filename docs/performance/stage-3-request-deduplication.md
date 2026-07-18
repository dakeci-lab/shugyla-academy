# Stage 3 — Request deduplication (Variant A)

**Date:** 2026-07-18  
**Scope:** Frontend only — in-flight coalesce + effect/remount hygiene.  
**Out of scope:** SQL/migrations, Edge redeploy, RLS/indexes, lazy routes, React Query, tracker/Realtime.

## Target (from Stage 2 / S2-F03)

| Surface | Before | After (goal) |
|---------|--------|--------------|
| Home `admin-team-workforce-data` | ×2 | ×1 |
| Employees `admin-list-employees` | ×7 | ×1 list (+ optional filter preview) |
| Employees RBAC catalog | ×7–8 | ×1 per session (`ensureRbacLoaded`) |
| Profile list Edge | ×6–7 | ×1 lookup (`employee_id`) |
| Schedule control workforce | ×1 | ×1 (unchanged) |

## Root causes fixed

1. **Home ×2** — `OwnerDashboard` `loadData` depended on `employeeIdsKey` derived from `teamEmployees`; cloud fetch updated that key and re-ran the effect.
2. **Employees / Profile storms** — network effects depended on AcademyData `version`, bumped by progressive bootstrap `notifyModulesChanged`.
3. **RBAC ×N** — `getRolesForEmployeeForm` delegated to adapter `loadRbacSnapshot()`, bypassing `ensureRbacLoaded`.
4. **No Edge coalesce** — concurrent identical invokes were not shared.

## Changes

- `src/lib/requestCoalesce.js` — shared in-flight map; cleared on logout.
- `listEmployeesForAdmin` / `fetchTeamWorkforceData` — session-scoped coalesce keys.
- `OwnerDashboard` — cloud path ignores employee-id key feedback.
- `EmployeesSection` / `EmployeeProfileSection` — drop `version` from network load effects.
- `rbacService.getRolesForEmployeeForm` / `getActiveRolesForAssignment` — route through `ensureRbacLoaded`.
- Logout — `invalidateRbacCache` + `clearInFlightRequests`.

## Verify

```bash
npm run verify:request-deduplication
npm run verify:home-dashboard
npm run verify:employees-list
npm run verify:progressive-bootstrap
npm run build
```

## Production re-measure (after deploy)

Resource Timing on Home / Employees / Profile: Edge multiplicity and RBAC waves should match the table above. Update findings backlog S2-F03 when confirmed.
