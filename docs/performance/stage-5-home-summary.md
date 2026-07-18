# Stage 5 — Home workforce summary

**Date:** 2026-07-18  
**Baseline:** Stage 4 Home workforce median ~4597 ms (full active staff + one day shifts)  
**Scope:** `view=home-summary` on `admin-team-workforce-data` + OwnerDashboard wiring.  
**Out of scope:** RLS, indexes, migrations, `admin-list-employees`, Schedule/Profile contract changes, bundle split.

## 1. Executive summary

Home metrics (`buildDailyMetrics`) only need employees who have **working shifts on the selected day**. Stage 5 adds `home-summary`: query day shifts first, then load lean employee rows for those IDs only. Frontend formulas (health, late grace, absence) stay in `OwnerDashboard`.

## 2. Home consumers (field table)

| Field | Used by Home | Where | Required | Aggregate? |
|-------|--------------|-------|----------|------------|
| employee.id | yes | detail rows / maps | yes | no |
| employee.full_name → name | yes | detail modal | yes | no |
| employee.position / role | yes | detail subtitle | yes | no |
| employee.avatar_url | no | — | no | — |
| employee.role_id / status | no | — | no | — |
| employee email/login/phone | no | — | no | — |
| shift.shift_date | yes | filter day | yes | — |
| shift.status | yes | working filter | yes | — |
| shift.planned_start/end | yes | late/absence + UI | yes | — |
| shift.actual_start | yes | check-in / late | yes | — |
| shift.actual_end / comment / breaks | no | — | no | — |
| full active staff list | **no** | was over-fetch | no | — |

Health score = `((scheduled - late - absent) / scheduled) * 100` — unchanged in frontend.

## 3. New contract

Same top-level shape as workforce (`employees`, `shifts`, `team_scope`, dates, `view: home-summary`) but:

- `date_from === date_to` (single day)
- employees ⊆ staff with shifts that day (active, non-admin)
- lean SELECT (no avatar/role_id/status/comment/breaks)
- no `employee_id` body key

Schedule (`schedule`) and Profile (`schedule` + `employee_id`) unchanged.

## 4. Queries

1. Auth once  
2. RBAC batch (2 queries)  
3. Shifts `eq(shift_date, day)` lean columns  
4. Employees `.in(id, shiftIds)` lean columns  

Server-Timing: `auth`, `authorization`, `employees`, `shifts`, `transform`, `total`.

## 5. Security

- Requires `schedule.view_team` (same as dashboard)
- 401/403 preserved
- No PII beyond display name/role/position for scheduled staff
- Timing logs: counts + ms only

## 6. Verify / deploy

```bash
npm run verify:home-workforce-summary
npm run verify:workforce-edge-performance
# + regression suite + build
```

- Commit: `perf(home): replace full workforce with summary`
- Edge redeploy: `admin-team-workforce-data` only
- Pages when frontend changes

## 7. Production results

_Filled after redeploy._

## 8. Recommended Stage 6

If Home still >3 s: inspect Server-Timing DB phases / query plans. Else `admin-list-employees` or bundle/lazy.
