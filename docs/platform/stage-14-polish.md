# Stage 14 — polish after the personnel cleanup (2026-10-17)

Follows `stage-13-cleanup.md`. Owner asked to plan and execute the leftovers the same day.

| # | Task | Status |
|---|---|---|
| 1 | Delete the orphan prod Edge Function `umag-probe-payments` (one-off UMAG payments probe, not in the repo, no callers) | done (`supabase functions delete`, 2026-10-17) |
| 2 | Delete remaining dead code: 22 files, −3 130 lines (old procurement `Simple*` / filter components, `purchaseOptimisticService`, `purchaseAccess`, `supplierAccess`, `purchaseFilter*`, `receivingList`, `simpleMarkdown`, `useBodyScrollLock`) | done |
| 3 | Retire verify scripts and local tooling of removed modules | done |
| 4 | Cut the dead «create from candidate» flow and the recruitment code behind it | done |
| 5 | Repair the stale verify scripts of kept features | pending |
| 6 | Update `CLAUDE.md`, archive docs of removed modules | pending |
| 7 | (owner decision) simplify the «Пользователи» form and `academy_users` columns | pending |

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
