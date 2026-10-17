# Time Tracker Dispatch Core (Step 20B)

Shared server-side core for shift-based time tracker notifications. No HTTP Edge Function or Cron on this step — only testable dispatch logic invoked by verification scripts and future Edge Function wrapper.

## Four events

| Rule code | Event | Offset | Repeats |
|-----------|-------|--------|---------|
| `time_tracker.rule.shift_start_soon` | `shift_start_soon` | −10 min before planned start | 1 attempt |
| `time_tracker.rule.clock_in_missing` | `clock_in_missing` | +5 min after planned start | 2 attempts, 10 min apart |
| `time_tracker.rule.shift_end_reached` | `shift_end_reached` | at planned end | 1 attempt |
| `time_tracker.rule.clock_out_missing` | `clock_out_missing` | +10 min after planned end | 2 attempts, 10 min apart |

Only `status = working` shifts for **active** employees are evaluated. `day_off`, `vacation`, `sick_leave`, `absence`, and inactive/deactivated/terminated employees are skipped.

## Asia/Almaty

All planned shift windows are built in `Asia/Almaty` (UTC+5). `shift_date` + `planned_start_time` / `planned_end_time` are interpreted in that zone — not browser-local time.

## Midnight end

If `planned_end_time = 00:00` and start is not `00:00`, the planned end is the **next calendar day** at midnight. Same rule applies when end time is less than or equal to start time (overnight shifts).

## Dedupe

Each notification uses `notifications.deduplication_key` (UNIQUE):

- `time_tracker:shift_start_soon:{employee_id}:{shift_id}`
- `time_tracker:clock_in_missing:{employee_id}:{shift_id}:a{attempt}`
- `time_tracker:shift_end_reached:{employee_id}:{shift_id}`
- `time_tracker:clock_out_missing:{employee_id}:{shift_id}:a{attempt}`

Duplicate keys are skipped; UNIQUE violations on insert are treated as duplicates (race-safe).

## Repeats

Rules with `max_attempts > 1` require `repeat_after_minutes` between attempts. Attempt 1 fires at the offset threshold; attempt 2+ only after the previous notification was created plus the repeat interval.

## In-app without subscription

Notifications are always created when a rule matches. If the employee has no active `permission_status=granted` push subscription, the notification stays in-app (`status=dispatched`, no push delivery). This is not an error.

## Web Push sender reuse

Push deliveries use `deliverNotificationToSubscription()` from `notificationDelivery.ts`, which wraps the Step 19 `sendWebPush()` sender. The sender is injected for tests (mock) and defaults to real `sendWebPush()` in production dispatch.

## dryRun

`dispatchTimeTrackerNotifications({ dryRun: true })` analyzes shifts and rules and returns counts only:

```json
{
  "scannedShifts": 0,
  "matchedEvents": 0,
  "createdNotifications": 0,
  "skippedDuplicates": 0,
  "pushAccepted": 0,
  "pushFailed": 0,
  "noActiveSubscriptions": 0
}
```

No notifications, deliveries, subscription changes, or sender calls are made.

## Not on this step

- HTTP Edge Function wrapper
- Cron / pg_cron
- Enabling seed `notification_rules` (`is_enabled` remains `false`)
- Real browser push to production or manual fixtures

## Verification

```bash
npm run supabase:local:verify-time-tracker-dispatch-core
```

Uses fixture prefix `time-tracker-dispatch-core-verify`, mock sender only, and cleans up fixture data while preserving `web-push-manual-staff` and seed templates/rules.

## Local dry-run Edge Function

HTTP wrapper: `POST /functions/v1/dispatch-time-tracker-notifications`

- **JWT:** `verify_jwt = true`; caller must be an active `academy_users` profile.
- **RBAC:** requires existing permission `schedule.edit` (schedule management).
- **Local guard:** `TIME_TRACKER_DISPATCH_TEST_ENABLED=true` and non-production `SUPABASE_URL` only; otherwise `403 dispatcher_disabled`.
- **Request:** `{ "run_at": "<ISO>", "dry_run": true, "rule_codes": ["time_tracker.rule.*", ...] }` — `dry_run` must be strictly `true`.
- **Response:** safe aggregate counts only (`scannedShifts`, `matchedEvents`, etc.); no employee/shift IDs or secrets.
- **No writes:** dry-run never creates notifications/deliveries or calls Web Push; seed `notification_rules` stay `is_enabled = false`.

Verification: `npm run supabase:local:verify-time-tracker-dispatch-edge`

## Manual real dispatch test

Local-only one-shot push for `web-push-manual-staff`:

```bash
node scripts/local-time-tracker-manual-dispatch.mjs --setup
node scripts/local-time-tracker-manual-dispatch.mjs --send
node scripts/local-time-tracker-manual-dispatch.mjs --status
# after user confirmation:
node scripts/local-time-tracker-manual-dispatch.mjs --cleanup
```

- **Guards:** `TIME_TRACKER_DISPATCH_TEST_ENABLED` + `TIME_TRACKER_DISPATCH_REAL_TEST_ENABLED`, non-production URL, JWT, active caller, `schedule.edit`.
- **Shift:** temporary `working` shift tagged `time-tracker-manual-dispatch` on a free calendar date (Asia/Almaty).
- **Rule:** only `time_tracker.rule.shift_start_soon` with `dry_run=false`.
- **Push:** real Web Push via existing sender; delivery expected `accepted`.
- **Dedupe:** second dispatch with same `run_at` increments `skippedDuplicates`, no second notification/delivery/push.
- **Cleanup:** removes temp shift, temp admin caller, and manual-dispatch notification/delivery only — not `web-push-manual-staff` or its browser subscription.
- Seed `notification_rules` remain disabled.
- Verification: `npm run supabase:local:verify-time-tracker-manual-dispatch`

## Local one-shot scheduler

Shared scheduler: `runTimeTrackerNotificationScheduler()` in `timeTrackerNotificationScheduler.ts`.

Local script:

```bash
node scripts/local-time-tracker-scheduler.mjs            # default: --dry-run
node scripts/local-time-tracker-scheduler.mjs --dry-run
node scripts/local-time-tracker-scheduler.mjs --once
node scripts/local-time-tracker-scheduler.mjs --status
```

- **Enabled rules only:** reads `notification_rules` where `module_code = time_tracker`, `is_enabled = true`, `trigger_type = scheduled`, and code is one of the four whitelisted `time_tracker.rule.*` values.
- **No enabled rules:** returns `{ ok: true, status: "no_enabled_rules", enabledRules: 0 }` — not an error; no notifications, deliveries, or sender calls.
- **dry-run (default):** analyzes shifts and returns aggregate counts; no writes, no sender.
- **Local real guard (`--once`):** requires `LOCAL_TIME_TRACKER_SCHEDULER_REAL_ENABLED=true`, `TIME_TRACKER_DISPATCH_REAL_TEST_ENABLED=true`, and local non-production `SUPABASE_URL`; otherwise exits with `local_real_scheduler_disabled`. Does not auto-enable seed rules.
- **Idempotency:** reuses dispatch core dedupe (`deduplication_key UNIQUE`, pre-check, `23505` handling). Parallel scheduler runs produce one notification per event.
- **No production Cron:** one-shot only; no background loops or system Cron jobs.
- **Production plan:** [production-readiness.md](./production-readiness.md) (planning only, no production connection).

Verification: `npm run supabase:local:verify-time-tracker-scheduler`
