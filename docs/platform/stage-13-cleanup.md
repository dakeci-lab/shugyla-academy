# Stage 13 — cleanup after hiding personnel modules

Follows `stage-12-hide-personnel-modules.md`. Owner decision (2026-10-16): the personnel data
is not needed and is deleted **without archiving**. Each sub-stage is its own PR.

| Sub-stage | What | Status |
|---|---|---|
| 13a | Close the public careers intake in the DB | done |
| 13b | Delete frontend code of hidden screens | done |
| 13c | Delete the 8 personnel Edge Functions (the 5 account functions stay) | code done; deployed copies to be deleted by hand |
| 13d | Drop personnel tables / buckets (irreversible, applied only on explicit go) | tables/functions **applied on prod 2026-10-16** — see `docs/db/stage-13d-personnel-tables-removal/`; buckets still manual |

## 13a — public careers intake closed

**Why:** the careers site is retired (stage 12) but the functions behind the public flow were
still executable by `anon` — an open write path with no legitimate caller.

**Change:** `supabase/migrations/20261016200000_revoke_anon_careers_intake.sql` revokes
`EXECUTE` from `anon` on `submit_candidate_application` (2 overloads),
`create_candidate_photo_upload_session`, `cancel_candidate_photo_upload_session`,
`get_public_vacancy_application_form`, `list_published_vacancies_for_apply`.
`authenticated` and `service_role` keep access. Tables were already closed by RLS; the
`candidate-photos` bucket is private.

**Applied on prod:** 2026-10-16 (via MCP, recorded by Supabase as `20261016181610`; the repo
file keeps its own timestamp, as with several earlier migrations).

**Postcheck (prod):** all 6 functions → `anon_exec = false`, `authenticated_exec = true`,
`service_exec = true`.

**Rollback:** the `grant execute … to anon` statements at the top of the migration file.

**Verification:** `npm run verify:careers-intake-closed` (9 checks).

## 13b — frontend code of hidden screens deleted

**What:** everything under `src/` that is no longer reachable from `src/main.jsx` and belongs
to personnel / HR / careers / notifications / the old admin shell: 201 files, **−31 491 lines**
(admin sections and modals, HR, careers, apply, payroll, schedule, time tracker, notification
UI and services, device permissions, public-apply services, the old `Admin`/`Apply`/`Vacancies`
pages, old `Header`/`Sidebar`/`Hero`, related utils and CSS).

**Method:** import graph from `src/main.jsx` (static, dynamic imports, CSS `@import`) →
unreachable files → filtered to the personnel scope → deleted in passes until stable (second pass
found nothing). Procurement, suppliers, sales, receiving files that were already dead before this
work (`components/procurement/Simple*`, `purchaseOptimisticService`, `purchaseAccess`,
`supplierAccess`, `purchaseFilter*`, `receivingList`, `simpleMarkdown`, `useBodyScrollLock`) were
**not touched** — separate cleanup.

**Tests / CI:** the careers e2e suite (`tests/e2e`, both `e2e-recruitment-*` workflows and the
three `test:e2e:recruitment*` npm scripts) was removed — it tested the retired site.
`@playwright/test` stays in `devDependencies` (dependency changes are a separate decision).

**Verify scripts:** 39 `verify:*` scripts whose only subject was a removed feature were deleted
(careers restyle, recruitment, schedule, notifications/web push, payroll, home/workforce,
documents, device onboarding, public-route isolation, roles-and-desktop-visibility,
page-refresh-experience, price-checker-and-standards-removal, request-deduplication, workforce
edge perf). Scripts on kept features that read a removed file were patched to drop only those
assertions (`buyer-role-compatibility`, `domain-deployment`, `employee-organization-structure`,
`employees-list`, `platform-data-rename`, `secure-platform-suppliers-rls`, `sunmark-icons-s2/s3`).

**Result:** build ok; `verify:*` — **no new failures** versus the stage-12 baseline (the same 42
already-stale scripts fail as before).

**Rollback:** `git revert` of the merge commit restores all files.

## 13c — personnel Edge Functions removed from the repo

**Removed (8):** `admin-manage-employee-schedule`, `admin-team-workforce-data`,
`admin-notification-settings`, `employee-time-tracker-action`,
`dispatch-time-tracker-notifications`, `run-time-tracker-notification-scheduler`,
`manage-push-subscription`, `send-test-web-push` — source dirs and their `config.toml` sections.

**Kept (5 account functions, used by «Пользователи»):** `admin-check-employee-login`,
`admin-create-employee`, `admin-list-employees`, `admin-update-employee`,
`admin-reset-employee-password`. Kept UMAG/procurement functions: `umag-sync`, `umag-procurement`,
`umag-operation-details`, `umag-sales-sync`, `procurement-archive`.

**Shared code:** 16 `_shared/*.ts` files (web push, notification delivery, time-tracker dispatch /
scheduler, subscription readiness, test broadcast/permits, `shiftWorkWindow`, `workforceFields`, …)
were reachable only from the removed functions (import graph from the 10 kept entry points) and
were deleted. No unresolved relative imports remain in the kept functions.

**Verify scripts:** `scheduler-controlled-run`, `time-tracker-dispatch-query-budget`,
`rating-and-escalations-removal` retired; `position-structure-data-layer` patched.

**Not done here — deployed copies on Supabase.** The functions are still deployed on the prod
project; deleting a deployed function is a dashboard/CLI action. Nothing calls them any more
(cron job 2 is disabled, the UI is hidden). Delete from the dashboard (Edge Functions →
function → Delete) or with the CLI:

```bash
supabase functions delete admin-manage-employee-schedule admin-team-workforce-data admin-notification-settings \
  employee-time-tracker-action dispatch-time-tracker-notifications run-time-tracker-notification-scheduler \
  manage-push-subscription send-test-web-push --project-ref cxadzerxndlscwvdaymk
```

**Left for 13b2 (frontend):** `attendanceSupabaseAdapter`, `shiftSupabaseAdapter`,
`webPushSubscriptionService` and the schedule/attendance/payroll APIs in `platformDataService`
are still bundled (reachable through `platformDataService`) but have no UI callers.

**Rollback:** `git revert` the merge commit, then redeploy the functions.

## 13b2 — push/attendance remnants (after the DB drop, 2026-10-16)

**Trigger:** right after 13d, prod logs showed `404` on `GET /rest/v1/notification_push_subscriptions`
(the table no longer exists). Source: `SessionContext` (after login and on logout) and
`registerServiceWorker` (after registration / `controllerchange`) still loaded
`webPushSubscriptionService`, which queried the dropped table. Errors were swallowed, but each was a
wasted request.

**Change:**
- `SessionContext`: no push sync after login, no push cleanup on logout.
- `registerServiceWorker`: no push resync.
- `platformDataService`: 42 exported functions with no caller (vacancies, candidates, shifts,
  work-location/attendance settings, check-in/out …) removed, plus their now-unused imports and the
  hollow `maybeClearLocalShiftsAfterTermination`.
- Orphaned files deleted: `webPushSubscriptionService` (~1 700 lines), `shiftLocalAdapter`,
  `shiftSupabaseAdapter`, 2 utils. `verify:production-vapid-rotation` retired.
- Checked with an ESLint `no-undef` pass over `src/` (0 findings; the config was sanity-tested).

**Still there (deliberately):** the «Пользователи» form keeps the legacy «create from candidate»
flow (`createFromCandidate`, `linkCandidateToEmployee`, candidate photo transfer) — it is
unreachable now (no candidates, no links), but untangling it from the user form is a separate,
riskier change. `getWorkLocations` keeps `attendance*Adapter` alive for the user form.
Old browser tabs running a pre-13b bundle may still log a few 404s until reloaded.
