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

## Step 22U — Controlled production test send attempt (partial)

**Date:** 2026-07-15
**Status:** frontend + `send-test-web-push` gate deployed; **no successful delivery**; **no DB records**.

| Item | Result |
|------|--------|
| Frontend commit | **`b05373e`** (bundle `assets/index-Dtk_bUds.js`) |
| Edge Function | `send-test-web-push` with `WEB_PUSH_PRODUCTION_TEST_ENABLED` gate |
| Backend test gates | temporarily enabled, then **disabled** (both secrets digest = `false`) |
| Frontend E2E flag | `config/production-web-push-e2e-test.flag` = **`enabled`** |
| Owner action | one accidental click before gated step; read-only audit showed **no** `notifications` / `deliveries` rows |
| Notifications / deliveries / sent | **0** / **0** / **0** |
| Rules enabled / Cron | **0** / **0** |

---

## Step 22V — Test-send diagnostics fix (local)

**Date:** 2026-07-15
**Status:** safe frontend diagnostics committed locally; **not deployed** until Step 22W.

| Item | Result |
|------|--------|
| Commit | **`745a178`** |
| Scope | `webPushSubscriptionService.js`, `PushNotificationSettings.jsx`, diagnostics verifier only |
| Edge Functions | **unchanged** |
| Test gates | **not enabled** |
| Test send | **not performed** |

Root cause addressed: `functions.invoke` error `context` is a `Response`; mis-parsed JSON produced generic UI errors; refresh cleared state.

---

## Step 22W — Diagnostics production deploy (completed)

**Date:** 2026-07-15
**Owner confirmation:** deploy **`745a178`** without retest push; rules **disabled**; Cron **off**.

| Item | Result |
|------|--------|
| Deployed commit | **`745a178`** |
| GitHub Pages workflow | **Deploy Shugyla Academy to GitHub Pages** run **29422446136** — **success** |
| Secondary workflow | **Deploy to GitHub Pages** run **29422445238** — **success** |
| Production bundle | `assets/index-CfthA7r8.js`, `assets/index-y715ftA8.css` |
| Production URL | `https://dakeci-lab.github.io/shugyla-academy/` |
| Diagnostics verifier | **23/23** |
| Subscription reconcile | **30/30** |
| Test send performed | **no** (button not clicked; `send-test-web-push` not invoked) |
| Notifications / deliveries / sent | **0** / **0** / **0** |
| Subscriptions total / active | **3** / **3** |
| Duplicate endpoints | **0** |
| Backend test gates | `WEB_PUSH_TEST_ENABLED` / `WEB_PUSH_PRODUCTION_TEST_ENABLED` — **disabled** (digest = `false`) |
| Rules enabled / Cron | **0** / **0** |
| Business baseline | **18/18** unchanged |
| Edge Functions redeployed | **no** |
| VAPID secrets rotated | **no** |

Diagnostics in production bundle: `session_expired`, `browser_subscription_missing`, `active_subscription_not_found`, `test_sender_disabled`, invoke/network classification; `sessionStorage` persistence key `shugyla.web_push.last_test_send_diagnostic`; `role="alert"`; no raw Edge Function JSON to user; no automatic retry on test-send.

---

## Step 22X — Controlled test-send attempt (rejected before INSERT)

**Date:** 2026-07-15
**Status:** one manual click; **no** notification/delivery records; gates locked down.

| Item | Result |
|------|--------|
| Prepare flow | **`7872a32`** deployed |
| Device prepare | owner confirmed ready; matching active subscription **1** |
| Test gates | temporarily **ON**, then **OFF** after click |
| Manual click | **1**; UI: «Сервер отклонил запрос» |
| Notifications / deliveries / sent | **0** / **0** / **0** |
| Root cause | server rejection at `send-test-web-push` before INSERT (exact code not proven) |
| Architecture gap | `manage-push-subscription` status vs sender gate order differed |

---

## Step 22Y — Sender-owned preflight (deployed)

**Date:** 2026-07-15
**Owner confirmation:** deploy safe `preflight` action without send, records, or gate enablement.

| Item | Result |
|------|--------|
| Commit | **`49bc2eb`** |
| Edge Function | `send-test-web-push` **deployed** (`verify_jwt=true`) |
| GitHub Pages | run **29427630875** — **success** |
| Action | `{ action: "preflight", device_id }` — no push/records/gates required |
| Frontend button | «Проверить готовность сервера» |
| Test gates | **OFF** |
| Rules / Cron | **0** / **0** |
| Notifications / deliveries | **0** / **0** |
| Verifier | `verify:web-push-sender-preflight` **47/47** |

### Owner manual preflight (iPhone) — success

**Owner confirmation:** preflight completed on same iPhone; test-send **not** pressed.

| Check | Result |
|-------|--------|
| Авторизация | **готово** |
| Устройство | **готово** |
| Active subscription | **1** |
| Сервер Web Push | **готов** |
| Test gates | **выключены** |
| Отправка | **заблокирована** |
| UI message | «Сервер и устройство готовы. Тестовая отправка выключена» |
| `ready_except_gates` | **true** (inferred from UI) |
| `ready_to_send` | **false** (inferred from UI) |
| Test-send button clicked | **no** |
| Push sent | **no** |
| Notifications / deliveries / sent (post-preflight audit) | **0** / **0** / **0** |
| Subscriptions total / active (unchanged) | **3** / **3** |
| Rules / Cron | **0** / **0** |
| Test gates final | **OFF** |

---

## Step 22Z — Controlled test-send attempt #2 (rejected, env-gate isolate mismatch)

**Date:** 2026-07-15  
**Status:** one manual click after sender preflight with gates ON; **no** notification/delivery records; gates locked down.

| Item | Result |
|------|--------|
| Preflight (gates ON) | `ready_to_send=true`, matching active subscription **1** |
| Manual click | **1**; UI: «Сервер отклонил запрос» |
| Notifications / deliveries / sent | **0** / **0** / **0** |
| Probable cause | Edge isolate env staleness: preflight isolate saw gates ON, send isolate saw gates OFF → early `test_sender_disabled` (403) before INSERT |
| Legacy gates after attempt | **OFF** |

---

## Step 22AA — DB-backed one-time test-send permits (deployed)

**Date:** 2026-07-15  
**Owner confirmation:** develop + deploy permit infrastructure; **no** permit issued in production; **no** push sent.

| Item | Result |
|------|--------|
| Commit | **`c957f36`** |
| Migration | **`20260715183000_notification_test_send_permits`** — applied + repaired on production |
| Table | `notification_test_send_permits` — RLS enabled; anon/authenticated direct access denied; service_role only |
| Issue RPC | `issue_notification_test_send_permit` — TTL **5 minutes** (server-fixed); revokes prior unused permits for employee/device |
| Consume RPC | `consume_notification_test_send_permit` — atomic `FOR UPDATE`; exactly-once before notification INSERT |
| Admin permission | **`schedule.edit`** (existing; no role_permissions changes) |
| Edge Function | `send-test-web-push` **v11**, `verify_jwt=true` — actions: `preflight`, `issue_permit`, `permit_status`, `send` |
| Legacy env gates | **OFF** (diagnostic only in preflight as `legacy_test_gates_enabled`; send authorized by permit only) |
| Frontend bundle | `assets/index-CuZe510x.js` |
| Production permits | **0** total / **0** active |
| Notifications / deliveries / sent | **0** / **0** / **0** |
| Verifier | `verify:web-push-test-permits` **76/76** |
| Business baseline | **18/18** unchanged |

### Permit flow (production UI)

1. «Подготовить устройство к тесту»
2. «Проверить готовность сервера» (`permit_required=true`, `ready_to_send=false`)
3. «Создать одноразовое разрешение» (admin + `roles.assign_permissions`; stores permit in sessionStorage only; **no UUID shown**)
4. «Отправить тестовое уведомление» (requires valid permit; one click; no auto-retry)

### Why env gates were replaced

Steps 22X/22Z showed env-gate toggles are unreliable for controlled production send (isolate env staleness). Permits provide durable, auditable, exactly-once authorization bound to authenticated employee + device.

---

## Step 22AD — Admin-only permit issue gate (deployed)

**Date:** 2026-07-15  
**Owner confirmation:** replace `TEST_SEND_PERMIT_ISSUE_PERMISSION` with `roles.assign_permissions`; redeploy `send-test-web-push` only; **no** permit issued; **no** push sent.

| Item | Result |
|------|--------|
| Commit | **`4fbd172`** — `fix: restrict web push permit issuance to admin` |
| Code change | `TEST_SEND_PERMIT_ISSUE_PERMISSION`: `schedule.edit` → **`roles.assign_permissions`** |
| `schedule.edit` RBAC | **Unchanged** — still assigned to «Администратор» + «Администратор торгового зала» |
| Permit issue permission | **`roles.assign_permissions`** — admin-only (`assignedRoleCount = 1`) |
| Edge Function | `send-test-web-push` **v12**, `verify_jwt=true`, **ACTIVE** |
| Legacy env gates | **OFF / OFF** |
| Production permits | **0** total / **0** active |
| Notifications / deliveries / sent | **0** / **0** / **0** |
| Subscriptions total / active | **3** / **3** |
| Verifier | `verify:web-push-test-permits` **98/98** |
| Business baseline | **18/18** unchanged |
| Frontend bundle | `assets/index-CuZe510x.js` (no frontend code change) |
| GitHub Pages | workflow **Deploy to GitHub Pages** run **29432930899** — **success** @ **`4fbd172`** |

### Why `schedule.edit` was not changed

Step 22AB blocked because `schedule.edit` is legitimately shared with «Администратор торгового зала». Step 22AC selected existing admin-only permission `roles.assign_permissions` instead of mutating `role_permissions`.

---

## Step 22AE — Permit-based controlled test (single attempt, delivery failed)

**Date:** 2026-07-15  
**Owner confirmation:** one permit + one manual send click; no retry.

| Item | Result |
|------|--------|
| Permit issued / consumed | **1 / 1** |
| Active permits after send | **0** |
| Notifications / deliveries | **1 / 1** (both **failed**) |
| Safe errorCode | **`web_push_not_configured`** |
| Provider status | **403** |
| UI message | «Серверная отправка уведомлений не настроена.» + «Одноразовое разрешение уже использовано» |
| Other devices | **not affected** |
| Legacy gates | **OFF / OFF** |

**Root cause (proven):** production Supabase `VAPID_*` secrets do not match canonical frontend public key fingerprint **`3766a407dc40a509`**. Permit/RBAC flow worked; failure at provider/VAPID signing.

---

## Step 22AF — VAPID secret reconciliation (**BLOCKED**)

**Date:** 2026-07-15  
**Owner confirmation:** reconcile secrets to canonical pair; no new pair; no push; no permit.

| Item | Result |
|------|--------|
| Canonical public source | `config/production-vapid-public.key` — fingerprint **`3766a407dc40a509`** ✅ |
| Matching private source | **not found** in allowed local sources ❌ |
| Local dev pair fingerprint | **`71653018b9bcdd1b`** (does not match canonical) |
| Production secrets updated | **no** (blocked) |
| New pair generated | **no** |
| iPhone resubscribe required | **no** (once matching private is restored) |

**Blocker:** `canonical_private_key_not_found`. Step 22S setup script persisted only the public key to git; private key was written to a deleted temp env-file and is not present in `.local-secrets/web-push.env` (local dev pair) or other gitignored env files.

**Required owner decision:** provide secure backup of matching private key for fingerprint `3766a407dc40a509`, **or** approve separate full VAPID rotation step (subscriptions would require re-registration).

---

## Next gated step — permit-based controlled test-send (separate owner confirmation)

After Step 22AA deploy:

1. Owner must give **separate explicit confirmation** before any test-send.
2. Prepare current device → sender preflight → issue one-time permit (5 min TTL).
3. Confirm valid permit → allow **one** manual «Отправить тестовое уведомление» press.
4. **No** auto-retry; legacy gates **OFF**; rules **disabled**; Cron **off**.

---

## Rollback

- Frontend: redeploy prior commit without VAPID public key in bundle.
- Subscriptions: deactivate rows via `manage-push-subscription` if needed (separate approval).
- VAPID rotation: only if subscriptions = 0.
