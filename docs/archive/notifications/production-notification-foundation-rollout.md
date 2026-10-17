# Production Notification Foundation Rollout — Step 22P

**Date:** 2026-07-15
**Status:** **completed**  
**Owner confirmation:** reconcile migrations, create notification tables, deploy notification Edge Functions, install VAPID secrets; rules **disabled**, Cron **off**, no real pushes.

Related: [production-notification-migration-reconciliation.md](./production-notification-migration-reconciliation.md), [production-readonly-audit.md](./production-readonly-audit.md)

---

## Scope

| Item | Result |
|------|--------|
| Production project ref | `cxadzerxndlscwvdaymk` |
| Frontend deploy | unchanged commit **`8d0cece`** |
| Business baseline | **18/18** preserved |
| Notification rules enabled | **0** |
| Cron jobs | **0** |
| Real Web Push sent | **0** |
| Subscriptions | **0** |
| Phase 3 | **not applied** |

---

## Migrations applied (SQL executed)

Applied via point `db query --linked -f` + `migration repair --status applied` (not `db push`):

| Version | Name | SQL executed |
|---------|------|--------------|
| `20260714230000` | `production_notification_foundation_reconciliation` | **yes** |
| `20260714231000` | `production_web_push_foundation_reconciliation` | **yes** |
| `20260714232000` | `production_notification_grants_reconciliation` | **yes** |

## Migrations repaired (SQL not re-run)

| Version | Name | Equivalence verified |
|---------|------|----------------------|
| `20260713194500` | `notification_system_foundation` | **yes** (via reconciliation + Phase 1) |
| `20260714120000` | `auth_first_login_foundation` | **yes** (via Phase 2) |
| `20260714130000` | `employee_provisioning_service_grants` | **yes** |
| `20260714140000` | `web_push_subscription_foundation` | **yes** |
| `20260714150000` | `web_push_delivery_tracking` | **yes** (canonical) |
| `20260714160000` | `time_tracker_dispatch_grants` | **yes** |

**Excluded permanently:** `20260714062253` (zero-byte empty stub — deleted locally, never in remote history).

---

## Notification objects created

| Object | Count / state |
|--------|---------------|
| `notification_templates` | **4** |
| `notification_rules` | **4** (all `enabled = false`) |
| `notifications` | **0** |
| `notification_push_subscriptions` | **0** |
| `notification_deliveries` | **0** |
| `notification_preferences` | table present |
| RLS | enabled; anon denied |
| `service_role` dispatch grants | present |

### Time-tracker rules (all disabled)

| Code | Offset | Repeat | Max deliveries |
|------|--------|--------|----------------|
| `time_tracker.rule.shift_start_soon` | −10 min | — | 1 |
| `time_tracker.rule.clock_in_missing` | +5 min | 10 min | 2 |
| `time_tracker.rule.shift_end_reached` | 0 min | — | 1 |
| `time_tracker.rule.clock_out_missing` | +10 min | 10 min | 2 |

---

## Edge Functions deployed

| Function | Status | `verify_jwt` | Notes |
|----------|--------|--------------|-------|
| `manage-push-subscription` | ACTIVE | `true` | JWT self-scope |
| `send-test-web-push` | ACTIVE | `true` | local-only production gate |
| `dispatch-time-tracker-notifications` | ACTIVE | `true` | dry-run capable; disabled rules → zero eligible |
| `run-time-tracker-notification-scheduler` | ACTIVE | `false` | HMAC required when enabled; returns **503** without scheduler secret |

**Not redeployed:** `admin-create-employee`, `admin-list-employees`, `admin-update-employee`.

**Total production Edge Functions:** **7**

### Safe smoke tests (negative only)

| Function | Test | Result |
|----------|------|--------|
| JWT functions | POST without JWT | **401** |
| Scheduler | POST without HMAC/secret | **503** (`scheduler_disabled`) |

---

## VAPID secrets

| Secret name | Installed |
|-------------|-----------|
| `VAPID_PUBLIC_KEY` | **yes** |
| `VAPID_PRIVATE_KEY` | **yes** |
| `VAPID_SUBJECT` | **yes** (`https://dakeci-lab.github.io/shugyla-academy/`) |

| Check | Result |
|-------|--------|
| Public key canonical fingerprint (first 16 hex) | `3f0f8656d45ac0b1` |
| Key pair valid | **true** |
| Private key in Git/src/dist/docs | **absent** |

**Not installed on this step:** `TIME_TRACKER_SCHEDULER_SECRET_*`, scheduler HMAC secrets, Cron.

---

## Frontend VAPID readiness

| Check | Result |
|-------|--------|
| Deployed commit | **`8d0cece`** |
| Bundle contains `pushManager` / VAPID hooks | **yes** (code present) |
| `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` baked into production bundle | **no** (expected blocker for E2E) |

**Blocker for browser subscription E2E:** frontend deploy with production public VAPID key — separate step.

---

## Business baseline (pre = post)

```json
{
  "academyUsers": 18,
  "authUsers": 18,
  "linked": 18,
  "unlinked": 0,
  "activeUsers": 10,
  "activeLinked": 10,
  "inactiveUsers": 8,
  "roles": 9,
  "rolePermissions": 137,
  "legacyPasswordsNonempty": 18,
  "duplicateLinks": 0,
  "orphanLinks": 0
}
```

Fingerprints unchanged (see [production-auth-cutover-plan.md](../auth/production-auth-cutover-plan.md)).

---

## Verification

```bash
npm run verify:production-notification-foundation-readiness
```

`supabase db push --linked --dry-run` → no pending migrations after reconciliation.

---

## Explicitly not done

- Notification rules enable
- Cron schedule
- Real Web Push delivery
- Production browser subscription
- Frontend redeploy / GitHub Secrets VAPID update
- Phase 3 password cleanup
- `git push`

---

## Next step (gated)

After separate explicit owner confirmation: controlled production Web Push E2E test on one administrator and one device — prepare frontend public VAPID key, deploy frontend, create one subscription, send exactly one test notification. Keep all automatic rules **disabled** and Cron **off**.

---

## Team workforce Edge Function inventory update — Step 22R

**Date:** 2026-07-15
**Scope:** deploy **only** `admin-team-workforce-data`; **no** notification function redeploy; **no** DB migration.

| Metric | Before | After |
|--------|--------|-------|
| Total Edge Functions | **7** | **8** |
| Employee/admin functions | 3 | **4** (+ `admin-team-workforce-data`) |
| Notification functions | 4 | **4** (unchanged) |
| Notification rules enabled | **0** | **0** |
| Cron jobs | **0** | **0** |
| Frontend commit (unrelated fix) | `8d0cece` | **`c6e80c1`** |
| Business baseline | 18/18 | **18/18** unchanged |
| VAPID secrets | unchanged | **unchanged** |

Readiness verifier updated: `npm run verify:production-notification-foundation-readiness` expects **8** total functions including `admin-team-workforce-data`.

---

## Step 22S — Production VAPID public key + admin subscription

**Date:** 2026-07-15
**Status:** VAPID deployed to frontend; owner subscription created; **no test push sent**.

| Item | Result |
|------|--------|
| VAPID rotation | **yes** (prior public key not recoverable; subscriptions were **0**) |
| Backend/frontend fingerprint | **`3766a407dc40a509`** |
| Frontend commits | `0811a45`, `d51e79c` |
| GitHub Pages deploy | run **#64** — **success** |
| Owner permission | **granted** (manual) |
| Subscriptions total | **2** (active **1**, admin **1** employee, distinct devices **2**) |
| Duplicate endpoints | **0** |
| Notifications / deliveries sent | **0** |
| Rules enabled | **0** |
| Cron | **0** |
| Business baseline | **18/18** unchanged |
| Ready for one controlled test send | **yes** (active subscription) |

See [production-web-push-e2e-test.md](./production-web-push-e2e-test.md).

---

## Step 22T — Web Push subscription reconciliation

**Date:** 2026-07-15
**Status:** disable → re-enable flow fixed; owner manual test **passed**; **no test push sent**.

| Item | Result |
|------|--------|
| Root cause | `upsert(onConflict: endpoint)` + inactive row on same `(employee_id, device_id)` → unique violation on re-register |
| Backend fix | device-scoped UPDATE before endpoint upsert (`manage-push-subscription`) |
| Frontend fix | reconcile flow + UX error categories (`453b22d`) |
| Owner manual re-enable | **success** |
| Subscriptions total / active | **3** / **3** |
| Duplicate endpoints | **0** |
| Notifications / deliveries sent | **0** |
| Rules enabled / Cron | **0** / **0** |
| Business baseline | **18/18** unchanged |

---

## Step 22U — Controlled production test send attempt

**Date:** 2026-07-15
**Status:** gated frontend + Edge Function path deployed; **no delivery**; backend gates later **disabled**.

| Item | Result |
|------|--------|
| Frontend commit | **`b05373e`** |
| `send-test-web-push` | deployed with production test gate |
| Notifications / deliveries / sent | **0** / **0** / **0** |
| Rules enabled / Cron | **0** / **0** |
| Business baseline | **18/18** unchanged |

---

## Step 22V — Web Push test-send diagnostics (local fix)

**Date:** 2026-07-15
**Commit:** **`745a178`** — frontend diagnostics + verifier only; **no** Edge Function / migration / gate changes.

---

## Step 22W — Web Push diagnostics production deploy

**Date:** 2026-07-15
**Owner confirmation:** deploy diagnostics **`745a178`**; **no** retest push; rules **disabled**; Cron **off**.

| Item | Result |
|------|--------|
| Deployed commit | **`745a178`** |
| GitHub Pages | run **29422446136** — **success** |
| Production bundle | `assets/index-CfthA7r8.js` |
| Test send | **not performed** |
| Notifications / deliveries / sent | **0** / **0** / **0** |
| Subscriptions total / active | **3** / **3** |
| Backend test gates | **disabled** (`WEB_PUSH_TEST_ENABLED`, `WEB_PUSH_PRODUCTION_TEST_ENABLED` digest = `false`) |
| Rules enabled / Cron | **0** / **0** |
| Edge Functions redeployed | **no** |
| VAPID secrets | **unchanged** |
| Business baseline | **18/18** unchanged |

Local docs commit: `docs: record web push diagnostics production deploy` (not pushed).

---

## Step 22X — Controlled test-send (server rejection, zero records)

**Date:** 2026-07-15
**Status:** one owner click; UI «Сервер отклонил запрос»; **0** notifications/deliveries; gates **OFF**.

---

## Step 22Y — Sender-owned preflight

**Date:** 2026-07-15
**Status:** deployed commit **`49bc2eb`**; `send-test-web-push` preflight action; gates **OFF**.

| Item | Result |
|------|--------|
| Edge Function | `send-test-web-push` only |
| GitHub Pages | run **29427630875** — **success** |
| Test gates | **OFF** |
| Rules / Cron | **0** / **0** |
| Notifications / deliveries | **0** / **0** |
| Business baseline | **18/18** unchanged |

### Owner manual preflight — success

| Check | Result |
|-------|--------|
| iPhone preflight UI | **success** |
| Active subscription | **1** |
| Test gates | **OFF** |
| Push sent | **no** |
| Notifications / deliveries | **0** / **0** |

---

## Step 22AA — DB-backed one-time test-send permits

**Date:** 2026-07-15  
**Status:** migration + `send-test-web-push` **v11** deployed; production permit **not issued**; push **not sent**.

| Item | Result |
|------|--------|
| Migration | `20260715183000_notification_test_send_permits` |
| Authorization | DB permit (TTL **5 min**, atomic consume) replaces env-gate send authorization |
| Admin permission | `roles.assign_permissions` (admin-only; replaces `schedule.edit` for permit issue) |
| Legacy test gates | **OFF** (diagnostic only) |
| Permits total / active | **0** / **0** |
| Notifications / deliveries | **0** / **0** |
| Rules / Cron | **0** / **0** |
| Commit | **`c957f36`** |

Context: Steps 22X/22Z rejected sends with 0 records while env gates appeared ON in preflight — isolate env staleness. Permits eliminate operational dependence on Edge secret propagation for send authorization.

---

## Step 22AD — Admin-only permit issue gate

**Date:** 2026-07-15  
**Status:** `send-test-web-push` **v12** deployed; **`roles.assign_permissions`** gates `issue_permit`; production permit **not issued**; push **not sent**.

| Item | Result |
|------|--------|
| Commit | **`4fbd172`** |
| Permit issue permission | **`roles.assign_permissions`** (admin-only) |
| `schedule.edit` | **Unchanged** in `role_permissions` |
| Legacy test gates | **OFF / OFF** |
| Permits total / active | **0** / **0** |
| Notifications / deliveries / sent | **0** / **0** / **0** |
| Rules / Cron | **0** / **0** |
| Business baseline | **18/18** unchanged |

---

## Step 22AE — Permit-based controlled test (failed at VAPID)

**Date:** 2026-07-15  
**Status:** permit consumed; notification/delivery recorded as **failed**; push **not delivered**.

| Item | Result |
|------|--------|
| Permit consumed | **1** |
| Notification / delivery | **1 / 1** failed |
| error_code | `web_push_not_configured` |
| provider_status_code | **403** |
| Canonical public fingerprint | **`3766a407dc40a509`** unchanged |
| Business baseline | **18/18** unchanged |

---

## Step 22AF — VAPID secret reconciliation (**BLOCKED**)

**Date:** 2026-07-15  
**Status:** matching private key for canonical public fingerprint **not found locally**; production secrets **not updated**.

| Item | Result |
|------|--------|
| Canonical public fingerprint | **`3766a407dc40a509`** |
| Private key cryptographically matched | **no** (source missing) |
| Secrets mutated | **none** |
| Push / permit on this step | **none** |

---

## Step 22AG — Production VAPID rotation (completed)

**Date:** 2026-07-15  
**Status:** new P-256 pair generated once; permanent private backup outside git; Supabase VAPID trio updated; frontend public key + sender Edge Functions redeployed; subscription rows **preserved**.

| Item | Result |
|------|--------|
| Old fingerprint | **`3766a407dc40a509`** (matching private **lost** — Step 22S temp-file-only write) |
| New fingerprint | **`a2027241e05d32fd`** |
| Secrets changed | VAPID trio only |
| Subscriptions deleted | **0** |
| Push / permit | **none** |
| Legacy gates / rules / Cron | **OFF / 0 / 0** |
| Business baseline | **18/18** unchanged |

---

## Step 22AN — Production automatic notifications **LIVE**

**Date:** 2026-07-15  
**Status:** **SYSTEM NOTIFICATIONS LIVE** — rules enabled, scheduler HMAC active, Cron every minute, no permit/test push.

| Item | Result |
|------|--------|
| Web Push on reconciled iPhone | **delivered** (Step 22AM) |
| Notification rules enabled | **4 / 4** |
| Scheduler `TIME_TRACKER_SCHEDULER_ENABLED` | **true** |
| Scheduler HMAC secret | **installed** (fingerprint only in ops logs) |
| Cron job | **`time-tracker-notification-scheduler-every-minute`** — `* * * * *`, **active** |
| Historical backfill | **none** (Asia/Almaty today ±1 day window only) |
| Permit / test push on this step | **none** |
| Original subscription trio | **1 active** (reconciled iPhone) / **2 inactive** (legacy VAPID, rows preserved) |
| Additional subscriptions during launch | **+3** employees self-registered (nasiba, mahabbat, qasiet) |
| Duplicate endpoints / notifications / deliveries | **0** |
| Unauthorized scheduler (no HMAC) | **401** |
| Cron cycles after launch | **7+ succeeded** |
| Business baseline | **18/18**, shifts **190**, roles **9**, role_permissions **137** |

### Rules (all enabled)

| Code | Offset | Repeat | Max |
|------|--------|--------|-----|
| `time_tracker.rule.shift_start_soon` | −10 min | — | 1 |
| `time_tracker.rule.clock_in_missing` | +5 min | 10 min | 2 |
| `time_tracker.rule.shift_end_reached` | 0 min | — | 1 |
| `time_tracker.rule.clock_out_missing` | +10 min | 10 min | 2 |

### Launch notes

- Production flow: `run-time-tracker-notification-scheduler` (HMAC) → `dispatch-time-tracker-notifications` → delivery → `webPushSender`.
- Cron uses `pg_cron` + `pg_net` + Vault-stored HMAC secret; calls scheduler only (not dispatcher directly).
- Legacy VAPID subscriptions deactivated with `is_active=false` only; `permission_status` unchanged; rows not deleted.
- Automatic deliveries to newly registered (non-reconciled) devices may fail with `web_push_not_configured` (403) until devices complete VAPID reconciliation — expected.
- Permit no longer used for production automation.

---

## Next step (gated)

Monitor shift-window notifications for reconciled devices; optional employee device reconciliation rollout for additional staff.
