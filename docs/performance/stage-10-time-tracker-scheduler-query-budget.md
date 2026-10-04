# Stage 10 — time-tracker scheduler query budget

**Date:** 2026-10-04
**Scope:** `supabase/functions/_shared/timeTrackerNotificationDispatch.ts` only. No migrations, no frontend, cron schedule unchanged (`* * * * *`).

## 1. Problem (measured on prod, 2026-10-03 16:00 → 2026-10-04 16:00 UTC)

- REST traffic was flat ~2 700 requests/hour, including 00:00–08:00 — i.e. machine-driven, not users.
- `/rest/v1/notifications`: 58 842 GET/day (~41/min). `academy_users` 1 632 and `academy_employee_shifts` 1 404 = one per cron run.
- Cause: for every shift in a 3-day window × every rule, the dispatcher ran `loadExistingAttempts` (repeat rules) and a per-match dedupe `select`, even when nothing was due.
- Table is tiny (1 883 rows), so the cost is request count / logs, not data size.

Org usage before the change: Free plan egress 5.7 / 5 GB (restricted, 402), Log Ingestion 6.9 / 1 GB. After moving to Pro (2 Oct): ~100 MB/day egress, up to 164 MB/day logs.

## 2. Change

1. Pass 1 (no I/O): evaluate every (shift, rule) with **no prior attempts**. Prior attempts can only suppress a match, never create one, so a `null` here is final.
2. If no candidates → return without touching `notifications` (idle run).
3. One batched `notifications` lookup by exact `deduplication_key` (`in`, chunks of 40) covers both repeat-attempt history and the duplicate check. Keys per pair: bare key + `:a1..:a{max_attempts}` for repeat events.
4. Duplicate check is a map lookup. The unique-violation (`23505`) handling on insert is untouched, so races between concurrent runs behave as before.
5. `notification_templates` is loaded lazily, only when a notification is actually about to be created.

Result counters (`scannedShifts`, `matchedEvents`, `skippedDuplicates`, …) keep their meaning.

## 3. Verification

- Old vs new module compared on 8 scenarios (dry run, fake client): identical `DispatchResult` in all 8. `notifications` queries: 14 → 0 on idle runs, 14 → 1 on busy runs.
- `npm run verify:time-tracker-dispatch-query-budget` pins the expected match counts and the query ceiling.
- NOT run: the Docker-based `supabase:local:verify-time-tracker-*` suites (duplicate/race paths against a real DB).

## 4. Expected effect / how to confirm

- Idle minute: 3 REST calls (rules, shifts, users) instead of ~43. Busy minute: 4.
- Confirm after deploy: edge_logs `/rest/v1/notifications` GET count/day should fall from ~58 k to near the number of busy minutes; Usage → Egress/Log Ingestion per day should drop.

## 5. Not done (candidates for next step)

- Skip the shifts/users queries outside working hours or when the day has no shifts (needs a product decision on cron cadence).
- Frontend: duplicate-request hygiene (Stage 3 items), `select('*')` trimming, Realtime procurement subscription.
