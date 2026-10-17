# Stage 14 — polish after the personnel cleanup (2026-10-17)

Follows `stage-13-cleanup.md`. Owner asked to plan and execute the leftovers the same day.

| # | Task | Status |
|---|---|---|
| 1 | Delete the orphan prod Edge Function `umag-probe-payments` (one-off UMAG payments probe, not in the repo, no callers) | done (`supabase functions delete`, 2026-10-17) |
| 2 | Delete remaining dead code: 22 files, −3 130 lines (old procurement `Simple*` / filter components, `purchaseOptimisticService`, `purchaseAccess`, `supplierAccess`, `purchaseFilter*`, `receivingList`, `simpleMarkdown`, `useBodyScrollLock`) | done |
| 3 | Retire verify scripts and local tooling of removed modules | done |
| 4 | Cut the dead «create from candidate» flow and the recruitment code behind it | done |
| 5 | Repair the stale verify scripts of kept features | done |
| 6 | Update `CLAUDE.md`, archive docs of removed modules | done |
| 7 | (owner decision) simplify the «Пользователи» form and `academy_users` columns | form done; DB columns pending (irreversible, separate go) |

## 2 — dead code

Found with the import graph from `src/main.jsx` (same method as 13b). Only unreachable files; brand
assets and `.DS_Store` ignored. Build ok, ESLint `no-undef` 0. Five verify scripts that read deleted
files were patched to drop only those assertions (`modal-scroll-lock`, `procurement-calendar-filter`,
`procurement-cross-device-sync`, `receiving-row-display`, `supplier-payments`); full `verify:*`: no new
failures (41 stale ones fail as before — tasks 3 and 5).

## 3 — tooling of removed modules retired

- 13 stale `verify:*` scripts whose only subject was a removed module (web push, VAPID, time tracker,
  notification foundation, weekly schedule open, workforce edge perf, recruitment apply hub,
  employee-create-fix).
- 31 other files in `scripts/` that only served push / time-tracker / notifications / recruitment /
  schedule: local fixtures and runners, production shift-notification launch scripts, VAPID key
  tooling and `lib/` helpers, `verify-time-tracker-*`, `verify-web-push-*`, `verify-notification-foundation`,
  `verify-employee-schedule-write`, `verify-team-workforce-admin-access`, the production TT push e2e,
  `cleanup-recruitment-upload-sessions`; their `package.json` entries removed. No dangling
  `npm run` references and no missing script files remain.
- Result: 28 stale `verify:*` scripts left (was 41), no new failures; they are the subject of task 5.

## Hotfix — terminating an employee broke after the DB drop (2026-10-17)

**Found while planning task 4:** `admin-update-employee` cleared the employee's future shifts after
any update of a terminated employee (`clearPlanShiftsAfterTerminationDate` → `academy_employee_shifts`).
Stage 13d dropped that table, so «Отключить» in «Пользователи» (and any later edit of a terminated
user) returned `schedule_clear_failed` (500) — the status change itself was saved, but the UI showed
an error.

**Fix (deployed to prod 2026-10-17 with `supabase functions deploy --use-api`):**
- `admin-update-employee`: the schedule-clearing block and its `schedule_clear` response field removed.
- `admin-create-employee`: the dead `source_candidate_id` shortcut (queried `academy_candidates`) removed.
- `_shared/employeeScheduleWrite.ts` deleted (no callers left).
- Audit of every `.from('<dropped table>')` / `rpc('<dropped function>')` in `supabase/functions` and
  `src`: the remaining hits are only in unreachable-by-UI frontend code (`recruitmentSupabaseAdapter`,
  `candidatePhotoService`, `attendanceSupabaseAdapter`) — removed in tasks 4 and 7.

**Lesson recorded for DB drops:** the preflight checked tables, views, policies and triggers but not
Edge Function code; add `grep` of `supabase/functions` to the preflight template of the next drop.

## 4 — «create from candidate» flow and recruitment code removed

- `EmployeesSection` / `EmployeeEditModal`: no `createFromCandidate` query handling, candidate prefill,
  link-to-candidate, candidate photo transfer, candidate meta block; `sourceCandidateId` no longer sent
  to `createEmployeeWithAuth` / `admin-create-employee`.
- `platformDataService`: `getVacancyById`, `getCandidateById`, `linkCandidateToEmployee` and all
  recruitment adapter wiring removed; `supabaseDataAdapter.fetchRecruitmentModuleData` and the
  recruitment part of `fetchAllData` removed; `cloudStore`: `recruitment` module and its store fields /
  getters removed; `localDataAdapter` no longer builds a recruitment bundle.
- Files deleted (unreachable after that): `recruitmentSupabaseAdapter`, `recruitmentLocalAdapter`,
  `candidatePhotoService` (`readPhotoAsDataUrl` inlined into `employeeAvatarService`), `utils/recruitmentData`,
  `applicationForm`, `kzPhone`, `slugify` — −2 800 lines.
- Build ok; ESLint `no-undef` 0 and no unused imports in the touched files; full `verify:*`: no new
  failures after patching `buyer-role-compatibility`, `domain-deployment` and `hide-personnel-modules`.

## 6 — CLAUDE.md and docs

- `CLAUDE.md` rewritten for the current scope (procurement + settlements only): domains, menu, data
  architecture without the removed modules, the 10 remaining Edge Functions and cron jobs, DB process with
  the stage-13d lesson (grep Edge Functions and frontend in every drop preflight), deploy-race rule,
  what is left.
- 19 docs of removed modules moved with `git mv` to `docs/archive/` (careers, notifications, hr shift
  clearing, auth team-workforce, workforce/scheduler performance stages, 4 platform docs); an
  `archive/README.md` explains them. `docs/hr/login-collision-incident.md` stays (referenced by
  `admin-create-employee`). No scripts or sources referenced the moved paths.

## 5 — stale verify scripts of kept features repaired

From 28 failing `verify:*` scripts down to 1 (100 scripts in total). Method: for each script find the
failing assertion, decide whether the code or the expectation moved, and update the script (never the
other way round); scripts whose whole subject no longer exists were retired.

**Updated to the current behavior** (examples): `umag-sync-lock` (the sales sync is a second writer with its
own entity `sales_facts`, asserted), `supplier-retroactive-payment-terms` (terms are now payment account +
days; open = not natively marked paid), `supplier-finance-summary` (owed amount = invoice until marked paid),
`procurement-order-actions` (cancelled filter lives in `OrdersPage`), `procurement-abc-analysis` (badge moved to
`AbcBadges.jsx`; expected check counts), `procurement-planning-v1` (tabs Planning → Norms; orders are separate),
`employee-admin-edge-performance` (admins are listed; DB budget = employees + position catalog),
`mobile-shell` / `mobile-profile` / `mobile-page-header` (no bell, user menu, documents row),
`loading-system`, `pwa-zoom-guard` (cache v7), `position-structure-ui`, `supplier-finance-*`.

**Retired (subject gone):** `supplier-finance-terms-missing-banner` (replaced by the unified status list),
`umag-open-obligations-sync` (the `sync_open_obligations` action no longer exists), `umag-first-suppliers`
(directory page merged), `procurement-mobile-access` (its main guarantee — nothing in the procurement group is
web-only — moved into `verify-hide-personnel-modules`).

**Code touched:** a comment in `procurementPlanningService.js` that tripped the «no service_role in src» scan;
`SupplierPaymentsPanel.css` lost a `scrollbar-width: thin` that broke the hidden-scrollbars policy.

**Still failing (1):** `auth-first-frontend-production-readiness` runs `supabase:local:verify-*` scripts that
need a local Supabase (Docker); it cannot pass in this environment.

## Checked: duplicate supplier «Данон»

Not a problem: the second record (`b82c9c87…`) is already merged into the first (`is_merged = true`,
`merged_into_supplier_id` set, `archived`, no obligations/supplies/orders); the platform's merge mechanism handled it
and the list hides merged suppliers.

## 7 — «Пользователи» form simplified

Owner confirmed (2026-10-17): drop what only the removed modules used.

- `EmployeeEditModal`: removed the fields «Дата приёма на работу», «Режим работы», «Тип расчёта зарплаты»,
  «Участие в ведомости», «Рабочая точка» and their keys from the create / update payloads. The create Edge
  Function already sets server-side defaults (`work_mode = offline`, `salary_calculation_type = shift_based`,
  `payroll_participation = active`, `hired_at = today`), and the update function only writes keys it receives,
  so nothing else changes.
- `getWorkLocations` and the now-unreachable attendance adapters/utils (`attendanceSupabaseAdapter`,
  `attendanceLocalAdapter`, `attendanceActionErrors`, `attendanceData`, `shiftMidnightEnd`) deleted.
- `verify:employees-list` updated; `verify:hide-personnel-modules` guards the form (50 checks).

**Not done (needs a separate explicit go, irreversible):** drop the `academy_users` columns `work_mode`,
`salary_calculation_type`, `payroll_participation`, `work_location_id` (and `hired_at`/`terminated_at` if
desired) and the table `platform_work_locations`. Preflight must include `grep` of Edge Functions and src.
