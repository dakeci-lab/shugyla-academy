# Production Auth Rollout Checklist

**Status:** Phase 1 applied in production. Approvals 2–6 pending.

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

## Approval 2 — Auth user provisioning

**Owner approval required. Next production write: `--dry-run` first.**

Run `scripts/production-auth-users-migration.mjs`.

- [ ] `--dry-run` aggregate report reviewed (`ready: true`, `conflicts: 0`)
- [ ] `--apply` executed with production `service_role` (env only, never Git)
- [ ] `--status` confirms all active users linked
- [ ] No passwords/emails/UUIDs in logs
- [ ] Inactive users linked but login still blocked by frontend
- [ ] **Do not** run Phase 2 until counts verified

---

## Approval 3 — Auth-first frontend + admin Edge Functions

**Owner approval required.**

- [ ] Deploy `admin-create-employee`
- [ ] Deploy `admin-list-employees`
- [ ] Deploy `admin-update-employee`
- [ ] Deploy Auth-first frontend (GitHub Pages)
- [ ] Smoke: admin login
- [ ] Smoke: cashier login
- [ ] Smoke: procurement/receiver login
- [ ] Smoke: inactive employee blocked
- [ ] Session restore + logout verified
- [ ] **Do not** run Phase 2 until smoke passes

---

## Approval 4 — Security cutover / anon revoke

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
