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

**Note:** Two rows exist for one admin (two device IDs); only **one** is `is_active = true`. Idempotent upsert on `endpoint` prevents duplicate endpoints. For the single test send, target the **active** subscription only.

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

## Next gated step — single test send

After owner confirmation (already granted for overall E2E scope):

1. Send **exactly one** test push via `send-test-web-push` to the **active** admin subscription.
2. Verify browser delivery and `notification_deliveries` tracking.
3. Do **not** resend; do **not** enable rules or Cron.

---

## Rollback

- Frontend: redeploy prior commit without VAPID public key in bundle.
- Subscriptions: deactivate rows via `manage-push-subscription` if needed (separate approval).
- VAPID rotation: only if subscriptions = 0.
