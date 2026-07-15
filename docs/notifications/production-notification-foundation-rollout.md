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

## Next step (gated)

Send **exactly one** production test Web Push to the **active** administrator subscription; verify browser delivery and delivery tracking. Rules **disabled**, Cron **off**.
