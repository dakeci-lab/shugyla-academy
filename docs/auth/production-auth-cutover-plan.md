# Production Auth Cutover Plan

**Status:** Phase 2 security cutover **applied** (Step 22O). Baseline **18/18** preserved. Legacy anon access **closed**.

Related: [production-auth-rollout-checklist.md](./production-auth-rollout-checklist.md), [../notifications/production-readonly-audit.md](../notifications/production-readonly-audit.md), [phase2-production-rollback.sql](./phase2-production-rollback.sql)

## Phase 2 production security cutover (Step 22O — completed)

**Date:** 2026-07-15
**Owner confirmation:** prepare and apply Phase 2 closing legacy anon access; **no** notification rollout.

| Item | Value |
|------|-------|
| Remote migration version | `20260714210000` (`production_auth_security_cutover_phase2`) |
| Local canonical file | `20260714210000_production_auth_security_cutover_phase2.sql` |
| Apply method | `supabase db query --linked -f` (single file) + `migration repair --status applied` |
| **Not used** | `supabase db push` (would risk notification stub `20260714062253`) |
| Rollback artifact | [phase2-production-rollback.sql](./phase2-production-rollback.sql) (manual emergency only) |

**Pre-cutover baseline (matched expected):**

| Metric | Value |
|--------|-------|
| `academy_users` / linked | **18/18** |
| active linked | **10/10** |
| inactive | **8** |
| `auth.users` | **18** |
| roles / role_permissions | **9** / **137** |
| legacy passwords nonempty | **18** |
| orphan / duplicate links | **0** |
| notification tables | **0** |
| Phase 2 in `schema_migrations` | **absent** |

**Fingerprints (pre = post, unchanged):**

| Object | Hash (md5 aggregate) |
|--------|----------------------|
| `academy_users` | `2db1f3bd96bab76e2dae079250882714` |
| `academy_employee_shifts` (190 rows) | `d073683ed209b226b0c3f85f644b7047` |
| `roles` | `01ca13172459631e3de1a12a1017173e` |
| `permissions` | `7fe9297b5643d1484092aac38a4ab897` |
| `role_permissions` | `0658d2ae42184583e2bb7c83c115594a` |

**Post-apply verification:**

| Check | Result |
|-------|--------|
| Anon `academy_users` SELECT/INSERT/UPDATE/DELETE | **denied** (REST + privileges) |
| Anon `academy_employee_shifts` SELECT | **denied** |
| Authenticated own profile (`auth_user_id = auth.uid()`) | **passed** |
| Admin Auth login | **passed** |
| Active staff Auth login | **passed** |
| Session refresh + logout | **passed** |
| `admin-list-employees` | HTTP **200**; safe DTO |
| RBAC catalog read (authenticated) | **passed** |
| Rating (admin team view) | **degraded** — cache limited to own profile via RLS; page loads |
| Schedule (admin team view) | **degraded** — same; own-shift RLS for direct reads |
| Time-tracker RPC (`attendance_check_in/out`) | **present**; Phase 2 did not revoke |
| Business mutations | **0** |
| Legacy passwords | **18/18** preserved |
| Phase 3 | **not applied** |
| Frontend deploy | unchanged commit **`8d0cece`** |
| Edge Functions | **3** ACTIVE (`verify_jwt=true`) |
| Notifications / Cron / VAPID | **untouched** |
| Rollback required | **no** (no outage) |

> **Next gated step:** notification foundation rollout — separate owner approval only.

---

## Phase 1 production apply (completed)

| Item | Value |
|------|-------|
| Production migration version | `20260714172032` (`production_auth_bridge_phase1`) |
| Local canonical file | `20260714200000_production_auth_bridge_phase1.sql` (same SQL, reordered) |
| First attempt | **Failed** — `employee_owned_by_current_auth()` created before `auth_user_id` column |
| Rollback | **Complete** — no partial state retained |
| Second attempt | **Success** — corrected apply order (see below) |

**Verified in production after apply:**

- `auth_user_id` exists, nullable
- FK `ON DELETE SET NULL`
- Partial UNIQUE index `idx_academy_users_auth_user_id_unique`
- Both helpers: `login_to_technical_email`, `employee_owned_by_current_auth`
- `academy_users` total = 17; linked = 0; legacy passwords nonempty = 17
- Legacy policies and anon grants **preserved**
- No Auth users created; notifications/functions/secrets/Cron untouched

**Production-verified apply order:**

1. Create `auth_private` schema + `login_to_technical_email()`
2. Add `auth_user_id` column + FK + partial UNIQUE index
3. Create `employee_owned_by_current_auth()` (requires column)
4. `notify pgrst, 'reload schema'`

**Next production write:** Phase 2 security cutover — separate owner approval. **Do not** apply without explicit confirmation.

---

## Auth-first frontend production deploy (Step 22N — completed)

**Date:** 2026-07-15
**Owner confirmation:** deploy Auth-first frontend without Phase 2, grants/policies, or notification rollout.

| Check | Result |
|-------|--------|
| Deployed commit | `8d0cece` (pushed to `origin/main`) |
| Rollback point (prior frontend) | `b72fca8` |
| GitHub Actions workflow | **Deploy to GitHub Pages** run **#60** — **success** |
| Production URL | `https://dakeci-lab.github.io/shugyla-academy/` |
| Auth-first login (production) | admin + staff **passed**; inactive **blocked** |
| Session restore / logout | **passed** (programmatic smoke) |
| Admin employee list | HTTP **200** via `admin-list-employees`; **10** items (page size); no forbidden fields |
| Production baseline | **18/18** unchanged; fingerprint **unchanged** |
| Business mutations | **0** |
| Phase 2 | **not applied** |
| Legacy grants/policies | **preserved** |
| Notifications / Cron | **untouched** |

> Phase 2 security cutover is the next gated step — requires separate owner approval.

---

## Auth-first frontend preparation (Step 22M — completed)

**Date:** 2026-07-15
**Owner confirmation:** prepare Auth-first frontend deploy without Phase 2, grants, policies, notifications, or Cron changes.

| Check | Result |
|-------|--------|
| Auth-first login flow | `signInWithPassword` + `auth_user_id` profile lookup; **no** legacy password compare |
| Session restore / logout | Supabase `getSession` + profile revalidation; `signOut` clears state |
| Inactive blocking | signOut + safe message after profile status check |
| Employee admin (cloud) | `admin-list/create/update` Edge Functions integrated |
| Legacy fallback | **absent** in cloud login path |
| Readiness script | `verify:auth-first-frontend-production-readiness` |
| Deploy plan | [auth-first-frontend-production-deploy-plan.md](./auth-first-frontend-production-deploy-plan.md) |
| Production deploy | **not performed** |
| Phase 2 | **not applied** |
| Grants / policies | **unchanged** |

> Frontend production deploy requires separate owner approval (Gate A in deploy plan).

---

## Authenticated employee admin smoke test (Step 22L — completed)

**Date:** 2026-07-15
**Owner confirmation:** non-mutating authenticated smoke test on reconciled baseline 18/18.

| Check | Result |
|-------|--------|
| Baseline pre/post | **18/18** linked; unlinked **0**; active linked **10/10**; inactive **8**; `auth.users=18`; legacy passwords **18** nonempty |
| Active admin sign-in | **success** |
| RBAC | `employees.view`, `employees.create`, `employees.edit` **confirmed** |
| `admin-list-employees` | HTTP **200**; **17** items (pagination total **17**); no password / raw auth fields |
| `admin-create-employee` negative | HTTP **422** (empty `{}` rejected before mutation) |
| `admin-update-employee` negative | HTTP **422** (missing `employee_id` rejected before DB update) |
| Production mutations | **0** (`academy_users` / `auth.users` / roles unchanged) |
| Aggregate fingerprint | **unchanged** |
| Edge Functions | **3** ACTIVE, `verify_jwt=true` |
| Frontend | **legacy** (not deployed) |
| Phase 2 | **not applied** |
| Notifications / Cron / secrets | **untouched** |

> Auth-first frontend deploy is the next gated step — requires separate owner approval.

---

## Single-user auth reconciliation (Step 22K — completed)

**Date:** 2026-07-15
**Owner confirmation:** drift cause accepted — new employee added via legacy frontend; record must be retained.

| Metric | Before 22K | After 22K |
|--------|------------|-----------|
| `academy_users` | 18 | **18** |
| linked | 17 | **18** |
| unlinked | 1 | **0** |
| active linked | 9 | **10/10** |
| inactive linked | 8 | **8/8** |
| `auth.users` | 17 | **18** |
| new Auth users created | — | **1** |
| conflicts | 0 | **0** |

**Actions:** one `auth.admin.createUser()` + `auth_user_id` link on sole unlinked row only (`.is('auth_user_id', null)`). Prior 17 links unchanged by script design.

**Preserved:** legacy passwords (18 nonempty); legacy policies/grants; employee status/role/shifts; frontend legacy; Phase 2 not applied.

> Reconciled baseline achieved. Authenticated smoke test **not** run on Step 22K.

---

## Production drift audit (Step 22J — read-only)

**Date:** 2026-07-15

| Metric | After 22F/22H | Current (22J) |
|--------|---------------|---------------|
| `academy_users` | 17 | **18** |
| linked | 17 | **17** |
| unlinked | 0 | **1** (active) |
| active | 9 | **10** |
| `auth.users` | 17 | **17** |
| legacy passwords nonempty | 17 | **18** |

**Step 22I:** Authenticated smoke test **correctly stopped** before sign-in (baseline mismatch 17 vs 18).

**Unlinked row (safe characteristics):** status `active`; role code `seller`; `created_at`/`updated_at` present (date 2026-07-14); login/password/role_id filled; **no** Auth technical-email match; **no** duplicate technical email; **1** shift record; **0** course assignments.

**Source classification:** **likely_created_via_legacy_frontend** (evidence: `auth_user_id` null — Edge `admin-create-employee` would set it; anon SELECT on `academy_users` still allowed; permissive legacy policy preserved; no DB auto-create trigger on `academy_users`; function invocation logs unavailable via CLI).

**Provisioning dry-run (22J):** `academyUsers=18`, `alreadyLinked=17`, `existingAuthMatches=0`, `wouldCreateAuthUsers=1`, `conflicts=0`, `activeUsers=10`, `inactiveUsers=8`, `ready=true`.

**Target baseline before frontend deploy / 22I retry:**

- `academy_users` = 18, linked = **18**, unlinked = **0**
- active linked = **10/10**
- `auth.users` = **18**
- conflicts = **0**

> **Auth-first frontend deploy** requires separate owner approval (Step 22L smoke passed).

---

## Phase C — Employee admin Edge Functions deploy (completed — Step 22H)

**Date:** 2026-07-14
**Owner approval:** deploy only `admin-create-employee`, `admin-list-employees`, `admin-update-employee`.

| Metric | Value |
|--------|-------|
| Functions deployed | **3** |
| `verify_jwt` | **enabled** on all three |
| Unauthorized smoke (no JWT) | **401** on all three |
| Frontend deploy | **not performed** (legacy) |
| Phase 2 | **not applied** |
| Notification migrations | **not applied** |
| Manual secrets set/unset | **none** |
| Cron | **not configured** |
| `academy_users` / Auth users | **unchanged** (17/17 linked) |

Deploy order: `admin-create-employee` → `admin-list-employees` → `admin-update-employee`. All **ACTIVE**.

> Authenticated functional smoke test **not** performed on Step 22H. Frontend remains on legacy anon path.

---

## Phase B production provisioning (completed — Step 22F)

**Date:** 2026-07-14
**Tool:** `scripts/production-auth-users-migration.mjs` (`--apply` with owner confirmation)

| Metric | Value |
|--------|-------|
| Production provisioning | **completed** |
| Existing Auth user linked | **1** |
| New Auth users created | **16** |
| Academy users linked | **17 / 17** |
| Active linked | **9 / 9** |
| Inactive linked | **8 / 8** |
| Conflicts / duplicates | **0** |
| Legacy passwords | **preserved** (17 nonempty) |
| Legacy policies / anon grants | **preserved** |
| Phase 2 | **not applied** |
| Deploy (frontend / Edge Functions) | **not performed** |
| Notification rollout | **not performed** |

**Pre-apply dry-run (verified):** `academyUsers=17`, `alreadyLinked=0`, `existingAuthMatches=1`, `wouldCreateAuthUsers=16`, `conflicts=0`, `activeUsers=9`, `inactiveUsers=8`, `ready=true`.

**Post-apply dry-run (verified):** `academyUsers=17`, `alreadyLinked=17`, `wouldCreateAuthUsers=0`, `conflicts=0`, `activeUsers=9`, `inactiveUsers=8`, `ready=true`. (`existingAuthMatches` counts only unlinked rows with an Auth match — **0** after full link.)

**Auth health (aggregate):** 17 Auth users; 17 email identities; 17 confirmed; 0 deleted; 0 anonymous; 0 orphan links; 17 distinct `auth_user_id` values.

> Phase B production apply **completed**. Do not re-run `--apply` without analysis.

---

| Finding | Impact |
|---------|--------|
| 17 `academy_users`, 9 active | All must retain login ability through cutover |
| 17 non-empty legacy `password` | Current frontend uses anon + plaintext password |
| 1 `auth.users` row | Only 1 employee can use Auth today |
| `auth_user_id` absent | No Auth-first link column in production |
| Permissive `FOR ALL USING(true)` on `academy_users`, `academy_employee_shifts` | Public read/write via anon |
| Anon has SELECT/INSERT/UPDATE/DELETE/TRUNCATE | Critical exposure |
| Notification tables absent | Notification rollout must follow Auth cutover |

**Direct Auth-first deploy is unsafe** — up to 16 employees lose login; security cutover before provisioning locks everyone out.

---

## Existing migration analysis

| Migration | Adds `auth_user_id` | Revokes anon | Drops legacy policy | Creates Auth users | Safe alone on production |
|-----------|---------------------|--------------|---------------------|--------------------|--------------------------|
| `20260713194500_notification_system_foundation.sql` | yes + backfill | no | no | no | **no** — creates entire notification system |
| `20260714120000_auth_first_login_foundation.sql` | no (expects column) | **yes** | **yes** | no | **no** — breaks legacy frontend immediately |
| `20260714130000_employee_provisioning_service_grants.sql` | no | no | no | no | yes (grants only) — needs Edge deploy |

### Answers

1. **Which adds `auth_user_id`?** — `20260713194500` (bundled with notifications) or new `20260714200000_production_auth_bridge_phase1.sql`.
2. **Which revokes anon?** — `20260714120000` and new Phase 2.
3. **Which removes legacy policies?** — `20260714120000` and new Phase 2.
4. **Breaks current frontend?** — `20260714120000` yes; Phase 1 no; Phase 2 yes (after Auth deploy).
5. **Depends on existing `auth.users`?** — backfill in `20260713194500` links unambiguous email matches only.
6. **Backfill `auth_user_id`?** — notification migration SQL backfill; production needs provisioning tool for remaining users.
7. **Creates Auth users?** — no migration creates Auth users (expected).
8. **Split required?** — **yes**. Phase 1 additive bridge + provisioning + Phase 2 cutover + Phase 3 password cleanup.

---

## Phase A — Additive bridge (SQL)

**Local file:** `supabase/migrations/20260714200000_production_auth_bridge_phase1.sql`
**Production applied as:** `20260714172032_production_auth_bridge_phase1` ✓

Apply order (production-verified):

1. `auth_private` schema + `login_to_technical_email()`
2. Nullable `academy_users.auth_user_id` + FK + partial UNIQUE index
3. `employee_owned_by_current_auth()` — **after** column exists
4. `notify pgrst, 'reload schema'`

Legacy login remains working (no policy/grant changes, no password clear).

> Phase 1 production apply **completed**. Do not re-apply.

---

## Phase B — Auth user provisioning (tool)

**File:** `scripts/production-auth-users-migration.mjs`

Modes: `--dry-run`, `--apply`, `--status`

1. Link existing Auth user where technical email matches.
2. Create missing Auth users via Admin API (server-side `service_role` from env only).
3. Use `loginToTechnicalEmail()` algorithm.
4. Idempotent; no duplicate Auth users; conflicts = blocker.
5. Set `academy_users.auth_user_id` after create/link.
6. Legacy `password` used only inside `createUser` request — never logged.
7. Inactive users: create/link but frontend blocks login by `status`.
8. No automatic email delivery.

Verify counts before Phase C:

```json
{
  "academyUsers": 17,
  "alreadyLinked": 17,
  "existingAuthMatches": 1,
  "wouldCreateAuthUsers": 0,
  "conflicts": 0,
  "inactiveUsers": 8,
  "ready": true
}
```

---

## Phase C — Auth-first deploy

1. Deploy `admin-create-employee`, `admin-list-employees`, `admin-update-employee`.
2. Deploy Auth-first frontend (GitHub Pages).
3. Smoke-test login: admin, cashier, procurement/receiver, inactive blocked.
4. Session restore + logout.

---

## Phase D — Security cutover (SQL)

**File:** `supabase/migrations/20260714210000_production_auth_security_cutover_phase2.sql`

**Preconditions:** Phase 1 applied; every **active** `academy_user` has `auth_user_id`; Phase C smoke passed.

1. Drop `"Allow anon read write academy_users"`.
2. Drop `"Allow anon read write academy_employee_shifts"`.
3. REVOKE anon DML/TRUNCATE on users, shifts, assignments, RBAC catalog.
4. Own-profile SELECT policy on `academy_users`.
5. Own-shift SELECT policy on `academy_employee_shifts`.
6. Authenticated read-only RBAC catalog.
7. Column-level grant excludes `password` from authenticated.
8. `service_role` retains full access for Edge Functions.

> **DO NOT RUN WITHOUT NEW OWNER APPROVAL**

---

## Phase E — Password retirement (SQL)

**File:** `supabase/migrations/20260714220000_production_legacy_password_cleanup_phase3.sql`

**HIGH RISK / DO NOT RUN YET**

Preconditions: Phase D stable; owner explicit approval.

1. `UPDATE academy_users SET password = ''` (not DROP column).
2. Prepare password reset flow for staff separately.

---

## Production vs local dev paths

| Path | Migrations |
|------|------------|
| **Local dev (existing)** | `20260713194500` + `20260714120000` + notifications |
| **Production Auth cutover** | `20260714200000` → provisioning → deploy → `20260714210000` → later `20260714220000` |
| **Production notifications (later)** | `20260713194500` … after Auth cutover stable |

`20260714120000` is **not** applied to production when using phased cutover — Phase 2 supersedes it for security semantics.

---

## Rollout readiness

**NOT_READY_FOR_DIRECT_NOTIFICATION_DEPLOY**

Required coordinated Auth cutover before notification migrations or Auth-first frontend alone.
