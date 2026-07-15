# Production Auth Rollout Checklist

**Status:** Phase 2 security cutover **applied** (Step 22O). Baseline **18/18** preserved. Legacy anon access **closed**.

Related: [production-auth-cutover-plan.md](./production-auth-cutover-plan.md), [phase2-production-rollback.sql](./phase2-production-rollback.sql)

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
- [x] Authenticated smoke test (Step 22L) — non-mutating; baseline **18/18** unchanged
- [x] Admin sign-in + RBAC (`employees.view/create/edit`) confirmed
- [x] `admin-list-employees` HTTP **200**; **17** items; no password/raw auth fields
- [x] `admin-create-employee` negative: HTTP **422**; **0** mutations
- [x] `admin-update-employee` negative: HTTP **422**; **0** mutations
- [x] Auth-first frontend prepared locally (Step 22M)
- [x] Readiness script: `npm run verify:auth-first-frontend-production-readiness`
- [x] Deploy plan: [auth-first-frontend-production-deploy-plan.md](./auth-first-frontend-production-deploy-plan.md)
- [x] Auth-first frontend deployed to GitHub Pages (Step 22N) — commit `8d0cece`
- [x] Workflow **Deploy to GitHub Pages** run **#60** — **success**
- [x] Post-deploy smoke: admin login **passed**
- [x] Post-deploy smoke: active staff login **passed**
- [x] Post-deploy smoke: inactive user **blocked**
- [x] Session restore + logout **passed**
- [x] Admin employee list **passed** (Edge Function HTTP **200**)
- [x] Production baseline **18/18** unchanged after deploy
- [x] Phase 2 security cutover applied (Step 22O) — see Approval 4

---

## Approval 4 — Security cutover / anon revoke ✓ COMPLETED (Step 22O)

**Date:** 2026-07-15
**Owner confirmation:** prepare and apply Phase 2 security cutover closing legacy anon access; **no** notification rollout.

**Production migration:** `20260714210000_production_auth_security_cutover_phase2`

- [x] Pre-cutover baseline **18/18** matched expected counts
- [x] Fingerprints captured (pre = post)
- [x] Phase 1 present (`20260714172032`); Phase 2 absent before apply
- [x] Notification migrations **not** applied (`notification%` tables = **0**)
- [x] Local Phase 2 verification (`supabase:local:verify-production-auth-cutover`) exit **0**
- [x] Rollback SQL prepared: [phase2-production-rollback.sql](./phase2-production-rollback.sql) (manual only)
- [x] Applied via **single** `db query --linked -f` (not `db push`)
- [x] Migration history repaired: `20260714210000` → `applied`
- [x] Legacy permissive anon policies **removed**
- [x] Anon SELECT/INSERT/UPDATE/DELETE/TRUNCATE on `academy_users` **denied**
- [x] Own-profile policy `academy_users_select_own_profile` **works**
- [x] Authenticated RBAC catalog read **works**
- [x] Production smoke: admin + staff Auth login **passed**
- [x] Session restore + logout **passed**
- [x] `admin-list-employees` HTTP **200** (safe DTO)
- [x] Baseline post-cutover **18/18**; fingerprints **unchanged**; business mutations **0**
- [x] Legacy passwords preserved **18/18**
- [x] Phase 3 **not** applied
- [x] Notifications / Cron / VAPID / Edge redeploy **untouched**
- [x] Frontend commit remains **`8d0cece`** (no redeploy)
- [ ] **BLOCKED:** Phase 3 password cleanup — separate owner approval
- [ ] **Do not** run notification rollout without separate owner approval

**Known post-Phase-2 behavior (non-outage):** admin team rating/schedule pages use in-memory employee cache from `fetchAllData()`; after cutover authenticated users see **own profile only** via RLS — team views may show reduced data until a future admin-read path. Employee admin list uses Edge Functions (unaffected). Time-tracker check-in/out uses `attendance_check_in/out` SECURITY DEFINER RPC (unchanged).

---

## Approval 2b — Drift remediation ✓ COMPLETED (Step 22K)

**Step 22J audit + Step 22K reconciliation (2026-07-15)**

- [x] External drift detected: `academy_users` 17 → **18**; unlinked **1** (active)
- [x] Owner confirmed: legacy frontend manual add; record retained
- [x] Step 22I smoke test correctly stopped before sign-in (pre-reconciliation)
- [x] Dry-run before 22K: `wouldCreateAuthUsers=1`, `conflicts=0`, `ready=true`
- [x] Targeted provisioning `--apply`: **1** Auth user created, **1** row linked
- [x] Reconciled baseline: **18/18** linked; active **10/10**; `auth.users=18`
- [x] Legacy passwords/policies/grants preserved
- [x] Step 22L authenticated smoke test completed (non-mutating)

---

## Approval 5 — Legacy password cleanup

**HIGH RISK — separate owner approval.**

- [ ] Auth-first stable ≥ agreed observation period
- [ ] Apply `20260714220000_production_legacy_password_cleanup_phase3.sql`
- [ ] Password reset flow communicated to staff
- [ ] Column retained (empty strings only)

---

## Approval 6 — Notification foundation rollout ✓ COMPLETED (Step 22P)

**Date:** 2026-07-15
**Owner confirmation:** reconcile migrations, create notification tables, deploy notification Edge Functions, install VAPID secrets; rules **disabled**, Cron **off**.

- [x] Overlapping local migrations audited; empty stub `20260714062253` **deleted**
- [x] Reconciliation migrations applied: `20260714230000`, `20260714231000`, `20260714232000`
- [x] Legacy versions repaired without SQL re-run: `20260713194500`–`20260714160000`
- [x] **Not used:** general `supabase db push`
- [x] Notification tables: **6**; templates **4**; rules **4**; enabled **0**
- [x] Notifications / subscriptions / deliveries: **0**
- [x] Cron jobs: **0**
- [x] VAPID secrets installed (names only in docs)
- [x] Notification Edge Functions deployed (**4**); employee functions **not** redeployed
- [x] Negative smoke: JWT functions **401** without token; scheduler **503** without secret
- [x] Business baseline **18/18**; fingerprints **unchanged**
- [x] Phase 3 **not applied**
- [x] Frontend commit **`8d0cece`** unchanged
- [x] Real Web Push sent: **0**
- [x] Readiness script: `npm run verify:production-notification-foundation-readiness`
- [x] Docs: [production-notification-foundation-rollout.md](../notifications/production-notification-foundation-rollout.md)
- [x] Frontend public VAPID key deployed (Step 22S, fingerprint `3766a407dc40a509`)
- [ ] **BLOCKED:** enable rules / Cron / scheduler HMAC — separate approvals

---

## Approval 8 — Production Web Push subscription setup ✓ COMPLETED (Step 22S)

**Date:** 2026-07-15
**Owner confirmation:** VAPID public key in frontend; one admin device subscription; **no test push**.

- [x] VAPID pair rotated (subscriptions were **0**); fingerprint **`3766a407dc40a509`**
- [x] Frontend deploy **`d51e79c`** — GitHub Pages run **#64** success
- [x] Owner permission **granted** (manual)
- [x] Subscriptions: total **2**, active **1**, admin employee **1**, duplicate endpoints **0**
- [x] Notifications / deliveries sent **0**; rules enabled **0**; Cron **0**
- [x] Business baseline **18/18** unchanged
- [x] Test push **not sent** (by design)
- [x] Docs: [production-web-push-e2e-test.md](../notifications/production-web-push-e2e-test.md)
- [ ] **BLOCKED:** single controlled test send — next gated step

---

## Approval 9 — Web Push subscription reconciliation ✓ COMPLETED (Step 22T)

**Date:** 2026-07-15
**Owner confirmation:** disable → re-enable on production PWA **successful**; **no test push**.

- [x] Root cause: backend `register` conflict on `(employee_id, device_id)` after endpoint rotation
- [x] Fix commit **`453b22d`** — frontend reconcile + Edge Function device-scoped UPDATE
- [x] `manage-push-subscription` deployed (production)
- [x] Frontend GitHub Pages bundle **`index-CggSmCBd.js`**
- [x] Owner manual: «Повторное включение прошло успешно»
- [x] Subscriptions: total **3**, active **3**, duplicate endpoints **0**
- [x] Notifications / deliveries sent **0**; rules enabled **0**; Cron **0**
- [x] Business baseline **18/18** unchanged
- [x] Test push **not sent** (by design)
- [x] Docs: [production-web-push-e2e-test.md](../notifications/production-web-push-e2e-test.md)
- [ ] **BLOCKED:** single controlled test send to owner admin device — next gated step

---

**Date:** 2026-07-15
**Owner confirmation:** deploy `admin-team-workforce-data` + frontend **`c6e80c1`**; Phase 2 preserved; rules disabled; Cron off.

- [x] Edge Function `admin-team-workforce-data` deployed (**ACTIVE**, `verify_jwt=true`, version **1**)
- [x] Prior **7** Edge Functions not redeployed (versions unchanged)
- [x] `git push origin main` fast-forward to **`c6e80c1`**
- [x] GitHub Pages workflow **29412374732** — **success**
- [x] Production smoke: workforce API **401/422/200/403** matrix **passed**
- [x] Главная / График / Рейтинг data paths **passed** (employees **9**, shifts **50** in current week)
- [x] Employee list **passed** (count **17**)
- [x] Business baseline **18/18**; fingerprints **unchanged**
- [x] Business mutations **0**
- [x] Phase 2 **not rolled back**; Phase 3 **not applied**
- [x] Notification rules enabled **0**; subscriptions **0**; pushes **0**; Cron **0**
- [x] Web Push E2E **not run** (by design)
- [x] Docs: [team-workforce-phase2-frontend-fix.md](./team-workforce-phase2-frontend-fix.md)

---

## Approval 7 — Team workforce production fix ✓ COMPLETED (Step 22R)

## Explicit prohibitions (all phases)

- No `supabase link` unless separately approved for migration history audit
- No notification rules enable without approval
- No scheduler Cron without approval
- No `send-test-web-push` in production by default
