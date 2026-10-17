# Team Workforce Phase 2 Frontend Fix

**Status:** **Production deployed (Step 22R).** Phase 2 preserved.

Related: [production-auth-cutover-plan.md](./production-auth-cutover-plan.md), [production-auth-rollout-checklist.md](./production-auth-rollout-checklist.md)

---

## Production deploy record (Step 22R)

**Date:** 2026-07-15
**Owner confirmation:** deploy `admin-team-workforce-data` + frontend; Phase 2 not rolled back; notification rules disabled; Cron off.

| Item | Value |
|------|-------|
| Edge Function | `admin-team-workforce-data` **ACTIVE**, `verify_jwt=true`, version **1** |
| Total Edge Functions | **8** (7 prior unchanged versions) |
| Frontend commit | **`c6e80c1`** |
| GitHub Actions | **Deploy to GitHub Pages** run **29412374732** — **success** |
| Production URL | https://dakeci-lab.github.io/shugyla-academy/ |

### Smoke results (non-mutating)

| Check | Result |
|-------|--------|
| No JWT → 401 | **passed** |
| Invalid payload → 422 | **passed** |
| Admin schedule (team) → 200 | **passed** (employees **9**, shifts **50**) |
| Admin dashboard view → 200 | **passed** |
| Admin rating view → 200 | **passed** |
| `admin-list-employees` → 200 | **passed** (count **17**) |
| Staff own schedule → 200 self scope | **passed** |
| Staff dashboard team → 403 | **passed** |
| DTO excludes password/login/auth fields | **passed** |
| Главная / График / Рейтинг (API parity) | **passed** |
| Employee list | **passed** |
| Business baseline 18/18 | **unchanged** |
| Fingerprints | **unchanged** |
| Notification rules enabled | **0** |
| Cron jobs | **0** |
| Pushes sent | **0** |
| Rollback required | **no** |

---

## Root cause

After Phase 2 security cutover (`20260714210000`), authenticated users may read only:

- their own `academy_users` profile (`auth_user_id = auth.uid()`);
- their own `academy_employee_shifts` rows.

Team pages still loaded data via:

- `fetchAllData()` → `supabase.from('academy_users').select(...)` into `cloudStore`;
- `getStaffEmployees()` / `getTeamShiftsForMonth()` → direct PostgREST reads.

Result: admin home, team schedule, and rating saw empty or self-only data while `admin-list-employees` (Edge Function + service_role) continued to work.

**Phase 2 is not rolled back.** Legacy anon access stays closed.

---

## Affected pages

| Page | Route | Component |
|------|-------|-----------|
| Главная (owner dashboard) | `/platform` | `OwnerDashboard.jsx` |
| График работы | `/platform/employees/schedule` | `WorkScheduleSection.jsx` |
| Рейтинг | `/platform/employees/rating` | `EmployeeRatingSection.jsx` |

---

## New API

**Edge Function:** `admin-team-workforce-data`  
**Method:** `POST`  
**Auth:** user JWT (`verify_jwt = true`)  
**Server:** service_role inside function only

### Request body

| Field | Required | Notes |
|-------|----------|-------|
| `date_from` | yes | `YYYY-MM-DD` |
| `date_to` | yes | `YYYY-MM-DD`, ≥ `date_from`, max 62 days inclusive |
| `timezone` | yes | must be `Asia/Almaty` |
| `view` | yes | `dashboard` \| `schedule` \| `rating` |

### Response

```json
{
  "ok": true,
  "view": "schedule",
  "timezone": "Asia/Almaty",
  "date_from": "2026-07-01",
  "date_to": "2026-07-31",
  "team_scope": true,
  "employees": [/* safe workforce employee DTO */],
  "shifts": [/* safe shift DTO */]
}
```

### Errors

| Code | HTTP |
|------|------|
| `unauthorized` | 401 |
| `inactive_caller` / `forbidden` | 403 |
| `invalid_date_range` / `invalid_view` / `invalid_timezone` | 422 |
| `internal_error` | 500 |

---

## Permission model

| View | Required permission | Scope |
|------|---------------------|-------|
| `dashboard` | `schedule.view_team` | full active team |
| `schedule` | `schedule.view_team` **or** `schedule.view_own` | team or self |
| `rating` | `rating.view` | team if `schedule.view_team`, else self |

| Role (typical) | Dashboard team | Schedule team | Rating team |
|----------------|----------------|---------------|-------------|
| admin | yes | yes | yes |
| floor_admin | yes | yes | yes |
| cashier / seller | no (own tracker) | own only | self only |
| inactive | denied | denied | denied |

RBAC resolved from `role_permissions` in database — not from Auth metadata.

---

## Safe DTO

**Employee:** `id`, `first_name`, `last_name`, `full_name`, `role`, `role_id`, `status`, `position`, `avatar_url`

**Excluded:** `password`, `login`, `auth_user_id`, technical email, JWT fields

**Shift:** `id`, `employee_id`, `shift_date`, `status`, planned/actual times, `comment`

---

## Frontend changes

| File | Change |
|------|--------|
| `src/services/workforceAdminService.js` | new adapter |
| `src/components/admin/OwnerDashboard.jsx` | cloud → workforce API |
| `src/components/admin/sections/WorkScheduleSection.jsx` | cloud team → workforce API |
| `src/components/admin/sections/EmployeeRatingSection.jsx` | cloud → workforce API |

Loading / error / retry / empty states: errors no longer render as “0 сотрудников”.

---

## PWA / cache

`public/sw.js` already bypasses Supabase (`isSupabaseOrExternal`). No service worker change required.

---

## Production deploy scope (next gated step)

**Completed in Step 22R.** See [Production deploy record](#production-deploy-record-step-22r) above.

1. Deploy **only** `admin-team-workforce-data` Edge Function. ✓
2. Push frontend commit + GitHub Pages deploy. ✓
3. Smoke test: Главная, График, Рейтинг (admin session). ✓
4. **Do not:** change DB policies, enable notification rules, create Cron, deploy other functions. ✓

### Smoke plan

- Admin login → Главная shows non-zero team metrics when shifts exist.
- График работы lists staff rows.
- Рейтинг lists staff rows.
- Cashier login → team schedule/rating not exposed beyond own scope.
- Employee list (`admin-list-employees`) unchanged.

### Rollback

- Redeploy previous frontend commit.
- Disable/remove `admin-team-workforce-data` function if needed.
- **Do not** revert Phase 2 RLS.

---

## Verification

```bash
npm run supabase:local:verify-team-workforce-admin-access
```
