# Web Push Sender (Local)

Server-side test push delivery via Edge Function with `notification_deliveries` tracking.

See also: [Web Push Foundation](./web-push-foundation.md)

## Flow

1. Authenticated employee clicks **«Отправить серверное push»** (DEV only).
2. Frontend sends only `{ device_id, request_id }` to `send-test-web-push`.
3. Edge Function validates JWT, finds active subscription for caller + device.
4. Creates `notifications` row (`module_code=web_push`, `event_code=web_push_test`).
5. Creates `notification_deliveries` row (`status=pending`) before network send.
6. Encrypts payload with subscription keys + VAPID; sends to browser push service.
7. Updates delivery status and subscription health based on provider response.
8. Service worker `push` handler shows system notification; `notificationclick` opens platform.

## VAPID Secrets

- **Private key:** `.local-secrets/web-push.env` → copied to ignored `supabase/functions/.env` by `npm run webpush:local:prepare-edge-env`
- **Public key:** `.env.local` → `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`
- Never in frontend private form, service worker, or Git.

## Dependency

- `web-push@3.6.7` pinned in `supabase/functions/send-test-web-push/deno.json` (function-scoped, not root `package.json`).

## Why Frontend Cannot Send title/body

Push content is server-controlled to prevent arbitrary notifications from compromised clients. Frontend only identifies the device and idempotency key.

## Idempotency

- `request_id` (UUID per click) stored on delivery.
- `deduplication_key = web_push_test:{request_id}` on notification.
- Duplicate request returns existing result without resend.

## Rate Limit

- Max 3 test pushes per 60 seconds per employee.
- Minimum 10 seconds between attempts.
- Based on `notifications` / `notification_deliveries` rows, not in-memory state.

## Accepted ≠ Device Delivery

HTTP 2xx from push provider means **accepted for delivery**, not guaranteed display on device. Status `accepted` (not `delivered`) reflects this.

## Error Classification

| Provider response | Delivery status | Subscription |
|---|---|---|
| 2xx | `accepted` | active, failure_count reset |
| 404/410 | `permanently_failed` | deactivated, revoked |
| 429/5xx/timeout | `retryable` | stays active, failure_count++ |
| 401/403 VAPID | `failed` (config) | not deactivated |
| Other | `failed` | not auto-deactivated |

## Delivery Security

Not stored: endpoint, p256dh, auth keys, VAPID values, JWT, raw provider body/headers.

Stored safely: `provider_status_code`, `error_code`, `error_message`, timestamps.

## Local Manual Test

1. Login as manual fixture (`web-push-manual-staff`).
2. Profile → **Уведомления включены**.
3. Click **«Отправить серверное push»**.
4. Minimize tab; wait for macOS notification.
5. Click notification → platform focuses.
6. Check Notification Bell for in-app entry.

Commands:

```bash
npm run webpush:local:prepare-edge-env
# restart local Supabase stack (preserves DB)
npm run supabase:local:verify-web-push-sender
```

## Limitations (not implemented)

- No automatic retry jobs / Cron
- No device delivery receipt from service worker
- No batch sender / dispatcher
- No production secrets or deployment
- `notification_rules` remain disabled
