# Stage 13d — apply report

**Applied:** 2026-10-16, production `cxadzerxndlscwvdaymk`, after the owner's explicit "применяй".
No backup was taken (owner decision).

## Re-verified before apply (live)
All 20 tables present; no FK from a kept table, no view, no RLS policy on a kept table depends on
them; procurement cron jobs active; kept counts `academy_users` 31, `purchase_orders` 831.

## Attempts
1. First attempt **rolled back atomically**: `attendance_check_in/out` return the row type of
   `academy_employee_shifts`, so the table could not be dropped first (`2BP01`, no `CASCADE`).
   Nothing was changed.
2. Second attempt (the two `attendance_*` functions dropped before the tables — now reflected in
   `apply_13d_drop_personnel.sql`) **committed**.

## Postcheck (prod)
- dropped tables still present: **0**; dropped functions still present: **0**
- kept: `academy_users` 31, `platform_suppliers` 459, `purchase_orders` 831,
  `supplier_payment_obligations` 3788, `roles` 9
- cron: `procurement-sync-scheduler-daily-0700-aqtobe` and `procurement-archive-scheduler-daily-0730-aqtobe`
  active; the time-tracker job is gone; `invoke_procurement_*` RPCs exist.

## Still manual
Delete the storage buckets `candidate-photos` and `employee-documents` in the dashboard
(Storage API only), delete the 8 deployed personnel Edge Functions, review the `employee-avatars`
anon write policies, clean the RBAC catalog of removed modules.
