# Production Auth Rollout Checklist

**Status:** Drift detected (Step 22J). **Auth-first frontend blocked.** Provisioning gap: 1 unlinked active employee. Authenticated smoke test (22I) pending drift fix.

Related: [production-auth-cutover-plan.md](./production-auth-cutover-plan.md)

---

## Pre-flight (read-only — completed Steps 22A/22B)

- [x] Project ref confirmed: `cxadzerxndlscwvdaymk`
- [x] Anon exposure confirmed on `academy_users`, `academy_employee_shifts`
- [x] Direct Auth-first deploy marked unsafe

---

## Approval 1 — Phase 1 additive migration ✓ COMPLETED

**Production migration:** `20260714172032_production_auth_bridge_phase1`

- [x] Production backup confirmed
- [x] Phase 1 applied (second attempt after full rollback of failed first attempt)
- [x] `auth_user_id` column exists (nullable)
- [x] FK + partial UNIQUE index verified
- [x] Both helper functions exist
- [x] Legacy anon policy **still present**
- [x] Legacy `password` values unchanged (17 nonempty)
- [x] Linked `auth_user_id` = 0 (provisioning not started)
- [x] No provisioning, deploy, or Phase 2 on this step

**First-attempt failure (resolved):** `employee_owned_by_current_auth()` was created before `auth_user_id` column. Local file reordered to match successful production apply.

---

## Approval 2 — Auth user provisioning ✓ COMPLETED

**Step 22F — owner-approved production provisioning (2026-07-14)**

Run `scripts/production-auth-users-migration.mjs`.

- [x] `--dry-run` aggregate report reviewed (`ready: true`, `conflicts: 0`)
- [x] `--apply` executed with production `service_role` (env only, never Git)
- [x] `--status` confirms all active users linked (17/17)
- [x] No passwords/emails/UUIDs in logs
- [x] Inactive users linked but login still blocked by frontend (8/8 linked)
- [x] Existing Auth user linked: **1**; new Auth users created: **16**
- [x] Legacy passwords preserved; legacy policies/grants preserved
- [x] Phase 2 **not** applied on this step
- [x] **Do not** run Phase 2 until Approval 3 smoke passes

---

## Approval 3 — Auth-first frontend + admin Edge Functions (partial — Step 22H)

**Edge Functions deploy completed (2026-07-14). Frontend deploy pending.**

- [x] Deploy `admin-create-employee` — ACTIVE, `verify_jwt=true`
- [x] Deploy `admin-list-employees` — ACTIVE, `verify_jwt=true`
- [x] Deploy `admin-update-employee` — ACTIVE, `verify_jwt=true`
- [x] Unauthorized smoke: all three return **401** without JWT
- [ ] **BLOCKED:** Authenticated smoke test (Step 22I) — stopped at baseline drift (17 expected vs 18 actual)
- [ ] **BLOCKED:** Deploy Auth-first frontend — requires 18/18 linked + smoke pass
- [ ] Authenticated smoke: admin login — pending drift fix + owner approval
- [ ] Smoke: cashier login — **blocked until drift fixed**
- [ ] Smoke: procurement/receiver login
- [ ] Smoke: inactive employee blocked
- [ ] Session restore + logout verified
- [ ] **Do not** run Phase 2 until authenticated smoke passes

---

## Approval 2b — Drift remediation (pending owner approval)

**Step 22J audit (2026-07-15) — read-only, no mutations**

- [x] External drift detected: `academy_users` 17 → **18**; unlinked **1** (active)
- [x] Step 22I smoke test correctly stopped before sign-in
- [x] Dry-run: `wouldCreateAuthUsers=1`, `existingAuthMatches=0`, `conflicts=0`, `ready=true`
- [x] Source: **likely_created_via_legacy_frontend**
- [ ] Targeted provisioning `--apply` for **1** unlinked employee only — **pending owner approval**
- [ ] Re-run Step 22I authenticated smoke test after 18/18 linked
- [ ] **Do not** deploy Auth-first frontend until above complete

---

**Owner approval required.**

- [ ] Apply `20260714210000_production_auth_security_cutover_phase2.sql`
- [ ] Permissive anon policies removed
- [ ] Anon cannot SELECT/UPDATE `academy_users`
- [ ] Own-profile policy works
- [ ] Staff cannot read other profiles
- [ ] `service_role` Edge Functions still work
- [ ] **Do not** run Phase 3 immediately

---

## Approval 5 — Legacy password cleanup

**HIGH RISK — separate owner approval.**

- [ ] Auth-first stable ≥ agreed observation period
- [ ] Apply `20260714220000_production_legacy_password_cleanup_phase3.sql`
- [ ] Password reset flow communicated to staff
- [ ] Column retained (empty strings only)

---

## Approval 6 — Notification migration rollout

**Only after Auth cutover stable. See notification preflight docs.**

- [ ] `20260713194500_notification_system_foundation.sql` (skip if tables already exist from earlier partial apply)
- [ ] Remaining notification migrations in order
- [ ] Edge Functions, secrets, rules, Cron — separate approvals each

---

## Explicit prohibitions (all phases)

- No `supabase link` unless separately approved for migration history audit
- No notification rules enable without approval
- No scheduler Cron without approval
- No `send-test-web-push` in production by default
