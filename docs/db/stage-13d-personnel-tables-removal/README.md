# Stage 13d — drop personnel / HR / careers / notification tables

**Status: APPLIED on prod `cxadzerxndlscwvdaymk` 2026-10-16 on the owner's explicit "применяй"** (see `APPLY-REPORT.md`).
Do not re-apply.
Follows `docs/platform/stage-13-cleanup.md` and the stage process in
`docs/db/stage-7a-academy-learning-removal/`.

**Owner decision (2026-10-16):** the personnel data is not needed; delete **without archive**.
There is therefore **no backup and no data rollback** from this repo. If Supabase platform backups
(PITR/daily) are enabled on the project they are the only way back — check before applying.

## What is dropped

20 tables (rows at 2026-10-16): `academy_employee_shifts` 1187, `salary_records` 58,
`salary_periods` 5, `salary_deductions` 17, `salary_allowances` 0, `academy_candidates` 42,
`academy_candidate_questions` 24, `academy_vacancies` 3, `academy_people` 39,
`recruitment_application_uploads` 25, `employee_documents` 6, `notifications` 2097,
`notification_deliveries` 3275, `notification_push_subscriptions` 47, `notification_preferences` 0,
`notification_rules` 4, `notification_templates` 4, `notification_test_send_permits` 10,
`notification_test_broadcast_audits` 9, `platform_attendance_settings` 1.
Plus 27 functions that only served them and the (already disabled) cron job
`time-tracker-notification-scheduler-every-minute`.

## What stays

`academy_users` (31 — login, roles, «who marked paid»), roles/RBAC, `positions` / `position_groups`,
`platform_work_locations`, `user_table_settings`, all procurement / suppliers / settlements /
receiving / sales tables, and the procurement cron jobs + `invoke_procurement_*` RPCs.
Kept counts for the postcheck: `academy_users` 31, `platform_suppliers` 459, `purchase_orders` 831,
`supplier_payment_obligations` 3788.

## Preflight result (prod, read-only, 2026-10-16)

- all 20 tables exist; **no foreign key from a kept table** into the set; **no view** over the set;
  **no RLS policy on a kept table** mentions a dropped table; no trigger on a kept table uses a
  dropped function. Every function whose body references a dropped table is in the apply list; the list also
  contains helper functions found by name (e.g. `recruitment_advisory_key`, `mark_notification_read`).
  `drop function` runs without CASCADE, so a missed dependency aborts the transaction.

## Steps

1. Confirm a platform backup exists (or consciously accept none).
2. `preflight.sql` — blocks B, C, D return 0 rows.
3. `apply_13d_drop_personnel.sql` — single transaction, **no CASCADE**; any unexpected dependency
   aborts everything.
4. `postcheck.sql` — blocks 1 and 2 return 0 rows, kept counts unchanged.
5. Smoke: «Пользователи» (list/create/role/disable), «Закуп», «Заказы», «Расчёты», «Главная».

## Not done by SQL (manual, Storage API only)

Direct `delete` on `storage.objects` is blocked by Supabase. Delete the buckets in the dashboard
(Storage → bucket → Delete): **`candidate-photos`** (43 files, 69 MB, applicants' photos) and
**`employee-documents`** (6 files, 3 MB). Keep `employee-avatars` (used by the profile).

## Follow-ups (not in this stage)

- RBAC catalog still lists permissions of removed modules (`recruitment.*`, `salary.*`,
  `notifications.manage`, schedule…) — clean `permissions` / `role_permissions` and the frontend
  catalog separately, because «Роли и доступы» shows them.
- `employee-avatars` bucket is public and has **anon** insert/update/delete storage policies —
  review; the profile uploads as an authenticated user.
- The 8 personnel Edge Functions are still deployed (see stage-13c).
