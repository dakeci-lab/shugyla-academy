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

**Environment:** `https://dakeci-lab.github.io/shugyla-academy/platform` · admin session · Resource Timing `duration` on `admin-team-workforce-data` · no HAR / no tokens / no PII.

| Run | Mode | duration (ms) | wf × | notes |
|-----|------|---------------|------|-------|
| 1 | cold (cache disabled) | 3029 | 1 | Server-Timing total 2389 |
| 2 | warm reload | 5172 | 1 | auth/authorization variance |
| 3 | SPA → Home | 3286 | 1 | body `view=home-summary` confirmed |
| 4 | warm reload | 4877 | 1 | — |
| 5 | SPA → Home | 2718 | 1 | body + counts confirmed |

**Home workforce median / min / max:** **3286** / 2718 / 5172 ms (n=5).  
**vs Stage 4 (4597 ms):** −28.5% (target was ≤3000 ms **or** ≥30%; narrowly under the % bar).  
**Count:** ×1 on all Home loads; `admin-list-employees` / purchase / receiving = 0.

**Workload confirmed (fetch body + JSON counts, no IDs/names logged):**

- `view=home-summary`, `date_from === date_to` (single day)
- employees ≈ 9, shifts ≈ 9 for the measured day (not full active staff)
- response `encodedBodySize` ≈ 1398 B (transfer ≈ 1698)

**Representative Server-Timing (ms, durations only):**

| Phase | Cold run | SPA run 5 |
|-------|----------|-----------|
| auth | 741 | 602 |
| authorization | 544 | 555 |
| employees | 821 | 280 |
| shifts | 283 | 753 |
| transform | 0 | 0 |
| total | 2389 | 2191 |

Dominant remaining cost: auth + authorization (+ occasional employees/shifts spikes). Transform ~0.

**Correctness spot-checks (no mutations):**

- Health gauge + metrics for today: 6 / 4 / 0 / 1 (scheduled / onTime / late / absent)
- Day prev → different day metrics (7 / 5 / 2 / 0), still `home-summary` single-day
- Day next → back to today metrics
- Attendance “ОТКРЫТЬ” control present; no session error

**Stage 5 status:** partially met — compact Home contract and ×1 request verified in production; median latency improved but did not clearly clear the ≤3000 ms / ≥30% gate.

## 8. Recommended Stage 6

After Home remeasure: if DB phases dominate → query plans; else optimize `admin-list-employees` (~3–4 s) or bundle/lazy. Do not start RLS/index without plans.
