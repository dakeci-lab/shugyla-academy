# VAPID production runbook

Safe operations for Web Push VAPID keys on Shugyla Platform production.

Related: [web-push-foundation.md](./web-push-foundation.md), [production-web-push-e2e-test.md](./production-web-push-e2e-test.md).

## Where keys live

| Item | Location |
|------|----------|
| Public key (frontend build) | `config/production-vapid-public.key` → `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` in GitHub Actions |
| Public + private + subject (runtime) | Supabase Edge Function secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| Secure offline backup | Outside repo: `~/.shugyla-platform/secrets/production-vapid.env` (mode `600`) |

Never commit private keys. Never print private keys, `p256dh`, `auth`, or full endpoints in logs/PRs.

Canonical subject:

```text
https://dakeci-lab.github.io/shugyla-academy/
```

Canonical fingerprint algorithm:

```text
SHA-256(decoded public key bytes) → first 16 lowercase hex chars
```

## Check pair match (no secret output)

Local / ops script:

```bash
npm run verify:production-vapid-alignment
```

Expected safe fields:

```text
configured: true
pair_matches: true
public_key_fingerprint: <16 hex>
subject_valid: true
```

Backend health is also exposed (authenticated) via `manage-push-subscription` action `status`:

- `server_vapid_fingerprint`
- `vapid_configured`
- `vapid_pair_matches`
- `vapid_subject_valid`

## Sync frontend after backend is canonical

1. Ensure production secrets public key is the intended pair (`pair_matches=true`).
2. Write **only** that public key into `config/production-vapid-public.key`.
3. Commit the public key file (public material only).
4. Deploy GitHub Pages so the bundle embeds the same key.
5. Verify:

```bash
npm run build
npm run verify:frontend-vapid-build
npm run verify:production-vapid-alignment
```

Fingerprints must match:

```text
frontend public fingerprint
= backend public fingerprint
= config/production-vapid-public.key fingerprint
```

## Deploy Edge Functions

After shared sender / subscription code changes:

```bash
npm exec --yes supabase@2.109.1 -- functions deploy manage-push-subscription --project-ref cxadzerxndlscwvdaymk
npm exec --yes supabase@2.109.1 -- functions deploy send-test-web-push --project-ref cxadzerxndlscwvdaymk
npm exec --yes supabase@2.109.1 -- functions deploy admin-notification-settings --project-ref cxadzerxndlscwvdaymk
npm exec --yes supabase@2.109.1 -- functions deploy dispatch-time-tracker-notifications --project-ref cxadzerxndlscwvdaymk
npm exec --yes supabase@2.109.1 -- functions deploy run-time-tracker-notification-scheduler --project-ref cxadzerxndlscwvdaymk
```

Secret value changes apply on the next function instance without requiring a new public key rotation, but redeploy after code changes.

## Re-subscribe one device

1. Sign in as the target employee on that device.
2. Open notification settings / admin device diagnostics.
3. If fingerprints disagree or status is `reconnect_required`, click **Переподключить уведомления**.
4. Flow: permission → `serviceWorker.ready` → unsubscribe mismatched browser subscription → `pushManager.subscribe(canonical public key)` → `manage-push-subscription` register with `client_vapid_fingerprint`.
5. Confirm diagnostics: frontend = subscription = server fingerprint, status `current`.

Do not mass-delete subscriptions.

## Controlled personal test

Prerequisites:

- `WEB_PUSH_PRODUCTION_TEST_ENABLED=true`
- Frontend flag `config/production-web-push-e2e-test.flag` = `enabled` (build-time)
- Device subscription `current`

Steps (admin diagnostics UI):

1. Prepare device
2. Preflight
3. Issue one-time permit
4. Send once

Success criteria:

- API `ok: true`
- `notification_deliveries.status = accepted`
- System notification visible on device
- Notification click opens `/shugyla-academy/platform...`

Do **not** use admin broadcast for single-device recovery.

## Rotate both keys (only when required)

Use separate invocations:

```bash
node scripts/setup-production-vapid-public-key.mjs --rotate [--overwrite]
node scripts/setup-production-vapid-public-key.mjs --install-secrets
```

Then deploy frontend + ask affected devices to reconnect.

### Why never rotate only public or only private

Web Push authentication requires a matching ECDSA P-256 pair. Changing one key breaks every send until devices re-subscribe with the new public key and the server signs with the matching private key.

### Why re-subscribe after rotation

Browser push subscriptions are bound to the `applicationServerKey` used at `subscribe()` time. Old endpoints reject pushes signed with a new VAPID pair (`403` / `vapid_rejected`).

## Rollback

1. Restore previous `production-vapid.env` backup (outside repo).
2. `node scripts/setup-production-vapid-public-key.mjs --install-secrets` from that backup (subject must be the production HTTPS URL).
3. Restore matching `config/production-vapid-public.key`.
4. Redeploy frontend.
5. Re-subscribe the controlled test device.

## Anti-patterns

- Installing local `mailto:dev@...` subject into production
- Frontend public key from a different pair than Supabase secrets
- Treating broadcast audit `status=completed` as delivery success
- Mass unsubscribe / truncate of `notification_push_subscriptions`
