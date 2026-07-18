# Stage 4 — Workforce Edge optimization (Variant E)

**Date:** 2026-07-18  
**Checkpoint before:** Stage 3 `c419635` / docs `67d4b84`  
**Scope:** `admin-team-workforce-data` + minimal frontend callers / coalesce key.  
**Not in scope:** RLS, indexes, migrations, `admin-list-employees`, bundle split, Stage 2 docs.

## 1. Executive summary

Stage 3 removed duplicate invokes; a **single** `admin-team-workforce-data` call still cost ~5–8 s. Stage 4 targets internal latency: batched RBAC checks, parallel employee+shift queries for scoped loads, Home single-day range, profile `employee_id` server filter, leaner shift SELECT.

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

## 5. Security

- Auth still via `authorizeAuthenticatedEmployee` (401 without bearer).
- Own-scope cannot request another `employee_id` (403).
- Team scope required for dashboard; rating/schedule rules unchanged.
- Service role not exposed; timing logs: counts + ms only (no PII/JWT).

## 6. Response contract

Unchanged top-level: `ok`, `view`, `timezone`, `date_from`, `date_to`, `team_scope`, `employees[]`, `shifts[]` with same employee/shift keys (breaks may be `null`).

## 7. Verify

```bash
npm run verify:workforce-edge-performance
npm run verify:request-deduplication
# + Stage 3 regression suite + build
```

## 8. Deploy

- Commit: `perf(workforce): reduce edge query latency`
- Edge: `npx supabase functions deploy admin-team-workforce-data --project-ref cxadzerxndlscwvdaymk`
- No `db push` / migrations / other functions.

## 9. Production results

_Filled after redeploy benchmark._

## 10. Recommended Stage 5

Depends on post-deploy median: if single workforce call still >3.5 s, obtain query plans / consider indexes or narrow `admin-list-employees`; else bundle/lazy or Academy fanout.
