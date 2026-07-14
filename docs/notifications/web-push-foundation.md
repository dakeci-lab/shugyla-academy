# Web Push foundation (local)

Browser-side registration of Push subscriptions with VAPID public key, secure server storage via Edge Function, and service worker handlers for display/click — without server-side push sending yet.

> In-app center: [in-app-notification-center.md](./in-app-notification-center.md)

## Architecture

1. User clicks **Enable notifications** on profile page.
2. Browser `Notification.requestPermission()` (user gesture only).
3. `PushManager.subscribe()` with `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`.
4. Frontend calls `manage-push-subscription` Edge Function with endpoint + keys + `device_id`.
5. Edge Function verifies JWT, resolves `academy_users` by `auth_user_id`, upserts `notification_push_subscriptions`.
6. Service worker handles future `push` events and `notificationclick`.

## VAPID keys

| Key | Location | In Git? |
|-----|----------|---------|
| Public | `.env.local` → `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` | No (local file ignored) |
| Private | `.local-secrets/web-push.env` → `VAPID_PRIVATE_KEY` | No |

Generate locally:

```bash
npm run webpush:local:generate-vapid
```

Private key must never appear in `src/`, `public/`, service worker, docs, or frontend bundle.

## Permission UX

- No automatic permission prompt on app load.
- Prompt only after explicit **Enable notifications** click.
- Denied state shows browser settings hint without re-prompting.

## Device ID

- UUID in `localStorage` key `shugyla.web_push.device_id`.
- Not a hardware/browser fingerprint.

## Shared device ownership

Push endpoint is globally unique. When another employee logs in on the same browser and registers, the Edge Function reassigns the endpoint row to the current Auth session employee.

## Edge Function: `manage-push-subscription`

| Action | Purpose |
|--------|---------|
| `register` | Upsert subscription for caller + device |
| `disable` | `is_active=false`, `revoked_at=now()` |
| `remove` | Delete caller's device row |
| `status` | Safe registration state (no endpoint/keys) |

JWT required (`verify_jwt = true`). No admin RBAC permission required — any active employee manages own device subscriptions.

## Logout

Before Supabase sign-out, frontend calls `remove` (best-effort, 3s timeout). Browser subscription may remain for re-register on next login; server row must not stay active for previous employee.

## Service worker

Existing install/activate/fetch handlers preserved in `public/sw.js`.

Added:

- `push` — safe JSON payload parsing + fallback title/body
- `notificationclick` — same-origin URL validation, focus/open window
- `notificationclose` — no-op

Icons use existing PWA assets under `/shugyla-academy/icons/`.

## Development test notification

In `import.meta.env.DEV` only, profile UI shows **Show test notification** using `registration.showNotification()` — not a real Web Push send.

## Local verification

```bash
npm run supabase:local:bootstrap -- --reset
npm run webpush:local:generate-vapid
npm run supabase:local:verify-web-push-foundation
```

Manual browser fixture:

```bash
node scripts/local-web-push-fixture.mjs --setup
npm run dev
```

## Server push sender

See [Web Push Sender](./web-push-sender.md) for server-side test push and delivery tracking.

## Not implemented yet

- Invalid endpoint cleanup after send failures
- Time tracker dispatcher / Cron
- Production VAPID secrets / deployment
