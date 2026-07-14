# Production Readiness Plan — Time Tracker Notifications

**Status:** planning document only. Nothing in this file is applied to production. No deploy, no Cron, no production secrets, and no rule enablement are performed by this step.

## 1. Current local status

| Area | Status |
|------|--------|
| Notification DB foundation | Migrated locally |
| Web Push subscriptions + delivery tracking | Migrated locally |
| Dispatch core (`dispatchTimeTrackerNotifications`) | Implemented + verified |
| Dry-run Edge Function (`dispatch-time-tracker-notifications`) | Implemented + verified |
| Manual real dispatch (one-shot, local guards) | Verified manually (Step 20D) |
| Shared scheduler (`runTimeTrackerNotificationScheduler`) | Implemented + verified |
| Scheduler Edge Function (`run-time-tracker-notification-scheduler`) | Implemented + HMAC auth verified locally |
| HMAC service-to-service auth | `schedulerRequestAuth.ts` — `crypto.subtle.verify` |
| Local one-shot scheduler script | Implemented (`scripts/local-time-tracker-scheduler.mjs`) |
| Local signed invoker | `scripts/invoke-local-time-tracker-scheduler.mjs` |
| Seed `notification_rules` (`time_tracker.rule.*`) | Present, **`is_enabled = false`** |
| Production scheduler / Cron | **Not implemented** |
| Production deploy | **Not performed** |
| Manual test user `web-push-manual-staff` | Preserved with active browser subscription |

Local verification commands (all exit 0 when healthy):

```bash
npm run supabase:local:verify-time-tracker-scheduler-auth
npm run supabase:local:verify-time-tracker-scheduler
npm run supabase:local:verify-time-tracker-dispatch-core
npm run supabase:local:verify-time-tracker-dispatch-edge
npm run supabase:local:verify-time-tracker-manual-dispatch
npm run supabase:local:verify-web-push-sender
```

## 2. Notification migrations (apply in order)

Apply only after review. Order reflects dependency chain:

1. `20260712163000_complete_flexible_rbac.sql` — RBAC permissions including `schedule.edit`
2. `20260713194500_notification_system_foundation.sql` — templates, rules, notifications, in-app center
3. `20260714120000_auth_first_login_foundation.sql` — auth linkage for employees
4. `20260714130000_employee_provisioning_service_grants.sql` — service_role grants for provisioning
5. `20260714140000_web_push_subscription_foundation.sql` — push subscription storage
6. `20260714150000_web_push_delivery_tracking.sql` — delivery status tracking
7. `20260714160000_time_tracker_dispatch_grants.sql` — `GRANT SELECT ON academy_employee_shifts TO service_role`

> Note: `20260714062253_web_push_delivery_tracking.sql` is an earlier duplicate filename; confirm which migration is canonical before production apply.

## 3. Edge Functions for future deploy

| Function | Purpose |
|----------|---------|
| `manage-push-subscription` | Browser subscription register/update |
| `dispatch-time-tracker-notifications` | Admin dry-run / guarded real dispatch (HTTP, JWT + RBAC) |
| `run-time-tracker-notification-scheduler` | **Production scheduler** — HMAC service-to-service, `verify_jwt=false` |
| `send-test-web-push` | Local test sender only — **do not expose in production** without hard guards |

Future production Cron calls `run-time-tracker-notification-scheduler` with signed `POST {}` — not the admin JWT endpoint.

## 4. Required environment secrets

| Secret | Where | Purpose |
|--------|-------|---------|
| `VAPID_PUBLIC_KEY` | Edge Functions env | Web Push encryption (public) |
| `VAPID_PRIVATE_KEY` | Edge Functions env only | Web Push signing |
| `VAPID_SUBJECT` | Edge Functions env | `mailto:` or `https:` contact for push service |
| `TIME_TRACKER_SCHEDULER_SECRET_CURRENT` | Edge Functions env only | HMAC signing secret (≥32 bytes, base64url) |
| `TIME_TRACKER_SCHEDULER_SECRET_PREVIOUS` | Edge Functions env (optional) | Rotation overlap window |
| `TIME_TRACKER_SCHEDULER_ENABLED` | Edge Functions env | `false` on first production deploy |
| `TIME_TRACKER_SCHEDULER_TEST_MODE` | Edge Functions env | `false` in production; local test header guard |

Supabase-managed (not in Git):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (Edge Functions only, never frontend)

## 5. Values that must NOT be in Git or frontend

- `VAPID_PRIVATE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Scheduler/internal bearer tokens or HMAC secrets
- Push subscription `auth_key` / `p256dh_key`
- Employee `endpoint` URLs
- Raw JWTs or session tokens in logs

Frontend may contain only:

- `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` (public key)
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`

## 6. Production scheduler plan (not implemented)

### Recommended check interval

- **Every 1–2 minutes** during business hours (Asia/Almaty), or every 2–5 minutes if load is low.
- Align `run_at` to actual invocation time; dispatch core evaluates offsets against `run_at`.

### Parallel-run protection

Existing dedupe is sufficient for notification creation:

- `notifications.deduplication_key UNIQUE`
- Pre-check before insert
- PostgreSQL `23505` treated as duplicate (race-safe)

Additional production measures:

- Single active scheduler worker (leader election or Cron `max_instances = 1`)
- Optional advisory lock only if monitoring shows duplicate deliveries under load

### Service-to-service authorization

Implemented: **HMAC-SHA256** via `schedulerRequestAuth.ts`.

- Headers: `x-shugyla-scheduler-timestamp` (Unix seconds), `x-shugyla-scheduler-signature` (`v1=<hex>`)
- Canonical: `<timestamp>\nPOST\n<SHA256_RAW_BODY_HEX>`
- Verification: `crypto.subtle.verify` (not string compare)
- Current + optional previous secret for rotation
- `verify_jwt=false` on scheduler function — JWT not accepted; HMAC mandatory
- Request body: `{}` only; `run_at` / `dry_run` / `rule_codes` forbidden
- Local test override: `x-shugyla-scheduler-test-run-at` header (local + test mode only)

Admin HTTP endpoint (`dispatch-time-tracker-notifications`) remains separate with `schedule.edit` RBAC.

Exact deploy steps: [production-deploy-plan.md](./production-deploy-plan.md)

### Retry / backoff

- Push delivery: use existing `notification_deliveries` status (`retryable`, `permanently_failed`)
- Future **retry worker** (not implemented): scan `retryable` deliveries with exponential backoff
- Scheduler itself: on transient DB errors, retry next interval (idempotent)

### Monitoring

- Log aggregate counts only (`scannedShifts`, `matchedEvents`, `createdNotifications`, `skippedDuplicates`, push outcomes)
- Alert on: `internal_error`, sustained `pushFailed`, zero `scannedShifts` during known shift windows, scheduler not running

## 7. Safe rule enablement rollout

1. **Disable all** `time_tracker.rule.*` in production (default after migration).
2. Enable **one rule** (`shift_start_soon`) for **one test employee** with a known shift.
3. Verify in-app + push on desktop Chrome PWA, then Android, then iOS PWA.
4. Enable same rule for a **limited pilot group** (5–10 employees).
5. Monitor `accepted` / `no_active_subscription` / `skippedDuplicates` for 3–5 days.
6. Enable remaining rules one at a time: `clock_in_missing` → `shift_end_reached` → `clock_out_missing`.
7. Expand to all active employees only after pilot metrics are stable.

Never bulk-enable all four rules for all employees on day one.

## 8. Rollback

| Action | Safe | Notes |
|--------|------|-------|
| Set `is_enabled = false` on rules | Yes | Stops new notifications immediately |
| Stop scheduler / Cron job | Yes | No new dispatches |
| Delete existing `notifications` | **No** | Audit trail loss |
| Delete `notification_push_subscriptions` | **No** | Users must re-subscribe |
| Revert Edge Function deploy | Yes | Keep DB; older function may not send |
| Revert migrations | Risky | Only if no production data depends on schema |

## 9. Acceptance tests (before full rollout)

| Scenario | Platform |
|----------|----------|
| Permission granted → subscription saved | Desktop Chrome |
| PWA installed → push received | Desktop Chrome PWA |
| Background / closed browser push | Android Chrome |
| iOS PWA (Add to Home Screen) | iPhone Safari |
| Foreground in-app notification | All |
| Click `action_url` opens correct route | All |
| Permission denied → in-app only | Desktop |
| Logout / login → subscription still valid or re-prompt | Desktop |
| Duplicate protection (same shift/event) | All |
| Employee without subscription → in-app only | All |

## 10. Monitoring metrics

| Metric | Source |
|--------|--------|
| `accepted` deliveries | `notification_deliveries.status` |
| `retryable` | `notification_deliveries.status` |
| `permanently_failed` | `notification_deliveries.status` |
| `subscription_expired` | delivery classification + subscription `is_active` |
| `no_active_subscription` | dispatch result count |
| Dispatcher failures | Edge Function logs, `internal_error` responses |
| `skippedDuplicates` | scheduler/dispatch aggregate response |
| Seed rules accidentally enabled | periodic SQL check `is_enabled = true` count |

## 11. Not yet implemented

- Production Cron / `pg_cron` job
- Production Edge Function deploy
- Production secrets provisioning (`TIME_TRACKER_SCHEDULER_ENABLED=true`)
- Retry worker for `retryable` deliveries
- Admin UI for managing `notification_rules` (enable/disable, offsets)
- Administrator escalation notifications (e.g. missed check-in alerts to managers)

Implemented locally (Step 21B): production scheduler Edge Function + HMAC auth + deploy plan document.

## Next step

Create Git checkpoint and run final production preflight locally. All production actions only after explicit owner approval.

Deploy plan: [production-deploy-plan.md](./production-deploy-plan.md)
