# Stage 4 — Workforce Edge optimization (Variant E)

**Date:** 2026-07-18  
**Runtime commit:** `2c64602` (`perf(workforce): reduce edge query latency`)  
**Checkpoint before:** Stage 3 `c419635` / docs `67d4b84`  
**Scope:** `admin-team-workforce-data` + minimal frontend callers / coalesce key.  
**Not in scope:** RLS, indexes, migrations, `admin-list-employees`, bundle split, Stage 2 docs.

## 1. Executive summary

Stage 3 removed duplicate invokes; a **single** `admin-team-workforce-data` call still cost ~5–8 s. Stage 4 cut internal latency via batched RBAC, parallel scoped queries, Home single-day range, profile `employee_id` server filter, and leaner shift SELECT.

**Production median Edge `duration` (Resource Timing, 3 runs):**

| Route | Before (Stage 3 ready/end proxy) | After (duration) | Δ |
|-------|----------------------------------|------------------|---|
| Home | ~6031 ms | **~4597 ms** | **−24%** |
| Profile workforce | ~8003 ms | **~3372 ms** | **−58%** |
| Schedule | ~5882 ms | **~2559 ms** | **−56%** |

Profile and Schedule exceed the −35% / ~3.5 s guide. Home improved but remains above 3.5 s (full active staff list still loaded for metrics).

## 2. Stage 3 checkpoint (baseline)

| Route | Workforce count | Median ready / Edge end |
|-------|-----------------|-------------------------|
| Home | ×1 | ~6031 ms |
| Profile | ×1 (full team then filter) | ~8003 ms workforce |
| Schedule | ×1 | ~5882 ms |

## 3. Architecture (call map)

```text
Home (dashboard, selected day)
Profile / EmployeeSchedule (schedule + employee_id)
WorkSchedule (schedule, week)
Rating (rating, month)
  → fetchTeamWorkforceData / Bundle
  → admin-team-workforce-data
  → Auth (once) → RBAC batch (2 queries)
  → employees + shifts (parallel when scoped)
  → mapSafe* → JSON
```

## 4. Root causes addressed

1. **RBAC waterfall:** `roleHasPermissionCode` ×3 → each 2 queries = **6 sequential** round-trips → batched `roleHasPermissionCodes` (**2** queries).
2. **Profile over-fetch:** full team month loaded, filtered in browser → `employee_id` + parallel queries.
3. **Home over-fetch:** full month of shifts for one-day metrics → `dateFrom=dateTo=selectedDateKey`.
4. **Payload:** unused break columns removed from SELECT (response keys remain `null`).
5. **No N+1** in prior code; team path still employees→shifts `.in(ids)`.

## 5. Internal timing (design + logs)

Safe structured log: `admin_team_workforce_timing` with `authMs`, `authzMs`, `employeesQueryMs`, `shiftsQueryMs`, `transformMs`, `totalMs`, counts (no PII).

Approximate request counts inside Edge:

| Phase | Before | After |
|-------|--------|-------|
| Auth (getUser + caller profile) | 1 path | 1 path |
| Permission checks | 6 queries | **2** queries |
| Employees | 1 | 1 |
| Shifts | 1 (after employees) | 1; **parallel** with employees when `employee_id` / own-scope |
| Attendance separate | 0 (embedded in shifts) | 0 |

## 6. Security

- Auth still via `authorizeAuthenticatedEmployee` (401 without bearer).
- Own-scope cannot request another `employee_id` (403).
- Team scope required for dashboard; rating/schedule rules unchanged.
- Service role not exposed; timing logs: counts + ms only.

## 7. Response contract

Unchanged top-level: `ok`, `view`, `timezone`, `date_from`, `date_to`, `team_scope`, `employees[]`, `shifts[]` with same employee/shift keys (breaks may be `null`).

## 8. Production benchmark (after deploy)

Method: authenticated Cursor Browser; Resource Timing `duration` on `admin-team-workforce-data`; invoke count always ×1; HAR not saved; `transferSize` often 0 (CORS).

| Route | Run1 dur | Run2 | Run3 | Median | Count |
|-------|----------|------|------|--------|-------|
| Home | 6445 | 4597 | 3088 | **4597** | ×1 |
| Profile | 4377 | 3372 | 2995 | **3372** | ×1 (+ list ×1) |
| Schedule | 2559 | 2243 | 3646 | **2559** | ×1 |

## 9. Verify / deploy

```bash
npm run verify:workforce-edge-performance
npm run verify:request-deduplication
# + Stage 3 regression suite + build
```

- Edge: deployed `admin-team-workforce-data` → `cxadzerxndlscwvdaymk` (script size ~735 kB)
- Pages: run `29634010631` success for `2c64602`
- No DB push / migrations / other functions

## 10. Remaining bottlenecks / Stage 5

- Home still loads **all active non-admin employees** for day metrics (~3–6 s Edge).
- `admin-list-employees` still ~3–4 s on profile.
- Bundle ~1.35 MB.

**Recommended Stage 5:** query-plan-backed indexes/RLS only if Home employees/shifts queries dominate logs; else optimize `admin-list-employees`, or Home aggregate/summary view without full employee rows.
