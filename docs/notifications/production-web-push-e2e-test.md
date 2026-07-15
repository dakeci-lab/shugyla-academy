# Production Web Push E2E Test Plan

Controlled end-to-end Web Push validation on production. **Automatic rules stay disabled. Cron stays off.**

Related: [production-notification-foundation-rollout.md](./production-notification-foundation-rollout.md), [web-push-foundation.md](./web-push-foundation.md)

---

## Owner-approved scope

- One administrator
- One device (target)
- One subscription (target)
- Exactly one test notification on the **next** gated step
- Notification rules **disabled**
- Cron **off**

---

## Step 22S — VAPID + subscription setup (completed)

**Date:** 2026-07-15

### VAPID key pair

| Item | Value |
|------|-------|
| Production public key recovery | **not available** locally (prior fingerprint `3f0f8656d45ac0b1` write-only in Supabase) |
| Rotation performed | **yes** (safe: subscriptions were **0**) |
| Canonical fingerprint (backend = frontend) | **`3766a407dc40a509`** |
| `VAPID_SUBJECT` | `https://dakeci-lab.github.io/shugyla-academy/` |
| Frontend config | `config/production-vapid-public.key` + GitHub Actions (`deploy.yml`, `main.yml`) |

### Frontend deploy

| Item | Value |
|------|-------|
| Commits | `0811a45`, `d51e79c` |
| GitHub Pages workflow | **Deploy Shugyla Academy to GitHub Pages** run **#64** — **success** |
| Bundle | `assets/index-nubLs2qU.js` (VAPID public key embedded) |

### Owner manual subscription

Owner confirmed: **permission granted, subscription created**.

| Metric | Value |
|--------|-------|
| Subscriptions total | **2** |
| Active subscriptions | **1** |
| Distinct endpoints | **2** (duplicate endpoint rows **0**) |
| Distinct admin employees | **1** (role **admin**, status **active**) |
| Distinct devices | **2** |
| Endpoint / p256dh / auth values | populated (not logged) |
| `created_at` | present |

**Note:** Two rows existed for one admin (two device IDs); only **one** was `is_active = true`. Idempotent upsert on `endpoint` prevents duplicate endpoints. For the single test send, target the **active** subscription only.

### Safety (unchanged)

| Metric | Value |
|--------|-------|
| `academy_users` / linked | **18/18** |
| Business fingerprints | **unchanged** |
| Notifications | **0** |
| Deliveries / sent | **0** |
| Rules enabled | **0** |
| Cron (notification) | **0** |
| Test push sent | **no** |
| Phase 2 | **applied** |
| Phase 3 | **not applied** |

---

## Step 22T — Subscription reconciliation fix (completed)

**Date:** 2026-07-15

### Root cause

After disable → enable on the same device, the browser created a **new push endpoint** while the backend row for `(employee_id, device_id)` still existed (inactive). `manage-push-subscription` used `upsert` only on `endpoint`, causing a unique-index conflict on `(employee_id, device_id)` → HTTP **500** and UI error «Не удалось обновить регистрацию уведомлений».

### Fix

| Layer | Change |
|-------|--------|
| Backend | `register` looks up by `(employee_id, device_id)` first; **UPDATE** existing row (new endpoint/keys, `is_active=true`); upsert by `endpoint` only for first registration on device |
| Frontend | `enablePushNotifications()` reconcile: SW ready → `getSubscription()` → reuse or subscribe → idempotent backend register; stale VAPID retry; categorized UX errors; double-click guard |
| Tests | `verify-web-push-subscription-reconcile.mjs`; re-enable stage in `verify-web-push-foundation.mjs` |
| Deploy | `manage-push-subscription` Edge Function + frontend commit **`453b22d`** (bundle `index-CggSmCBd.js`) |

### Owner manual disable → re-enable

**Owner confirmation:** «Повторное включение прошло успешно».

| Metric | Value (post-22T) |
|--------|------------------|
| Subscriptions total | **3** |
| Active subscriptions | **3** |
| Inactive (historical) | **0** |
| Distinct devices | **3** |
| Duplicate endpoints | **0** |
| Admin (`role=admin`) | **2** rows, **2** active (multi-device) |
| Other roles | **1** buyer row, **1** active (separate employee/device; not part of gated test send) |
| Notifications / deliveries / sent | **0** |
| Rules enabled | **0** |
| Cron | **0** |
| Business baseline | **18/18** unchanged |
| Test push sent | **no** |

**Gated test send:** target the **owner admin device** active subscription only (not buyer or secondary admin devices).

---

## Next gated step — single test send

After Step 22T owner confirmation (**re-enable successful**):

1. Send **exactly one** test push via `send-test-web-push` to the **owner admin device** active subscription (not secondary admin devices or other roles).
2. Verify browser delivery and `notification_deliveries` tracking.
3. Do **not** resend; do **not** enable rules or Cron.

---

## Rollback

- Frontend: redeploy prior commit without VAPID public key in bundle.
- Subscriptions: deactivate rows via `manage-push-subscription` if needed (separate approval).
- VAPID rotation: only if subscriptions = 0.
