# Stage 5 — Home workforce summary

**Date:** 2026-07-18  
**Runtime commit:** `46b6d2f` (`perf(home): replace full workforce with summary`)  
**Baseline (Stage 4):** Home workforce median ~4597 ms; min/max ~3088 / 6445 ms; workload = full active staff + one day shifts; count ×1.  
**Scope:** `view=home-summary` on `admin-team-workforce-data` + OwnerDashboard wiring.  
**Out of scope:** RLS, indexes, migrations, `admin-list-employees`, Schedule/Profile contract changes, bundle split.

## 1. Executive summary

Home metrics (`buildDailyMetrics`) only need employees who have **shifts on the selected day**. Stage 5 adds `home-summary`: query day shifts first, then load lean employee rows for those IDs only. Frontend formulas (health, late grace, absence) stay in `OwnerDashboard`.

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

Health score = `((scheduled − (late ∪ absent)) / scheduled) × 100` — unchanged in frontend.

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

Server-Timing header phases: `auth`, `authorization`, `employees`, `shifts`, `transform`, `total` (durations only; CORS expose + Timing-Allow-Origin).

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

- Commit: `46b6d2f`
- Edge redeploy: `admin-team-workforce-data` → `cxadzerxndlscwvdaymk` (script ~737 kB) — **success**
- Pages: live asset `index-MaaplTul.js` contains `home-summary` (deployed; Actions API rate-limited so run ID not re-fetched)

## 7. Production results

**Authenticated Home timing after deploy:** blocked — browser session returned Edge `unauthorized` (`Сессия истекла`) during measurement attempt. No invented medians.

**Manual remeasure checklist (admin session):**

1. Hard reload `/platform` (cache enabled), 3×.
2. Confirm Network: one `admin-team-workforce-data`, body `view=home-summary`, `date_from=date_to`.
3. Record `duration` median/min/max; note Server-Timing if visible.
4. Confirm health gauge + four metric cards match prior business rules for the same day.
5. Spot-check Profile scoped workforce ×1 and Schedule team week ×1 unchanged.
6. Compare employee/shift row counts vs Stage 4 full-staff payload.

Target: median ≤ 3000 ms or ≥ 30% below 4597 ms; count remains ×1.

## 8. Recommended Stage 6

After Home remeasure: if DB phases dominate → query plans; else optimize `admin-list-employees` (~3–4 s) or bundle/lazy. Do not start RLS/index without plans.
