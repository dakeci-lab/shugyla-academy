# Stage 15 — security hardening and account cleanup (2026-10-17)

Source: Supabase security/performance advisors and the owner's decision to remove unused accounts.

## 15a — function access hardening (applied on prod)

Migration `supabase/migrations/20261017150000_harden_function_access.sql` (Supabase recorded it as
`harden_function_access`):

- `invoke_procurement_sync_scheduler()` / `invoke_procurement_archive_scheduler()`: `EXECUTE` revoked from
  `public`, `anon`, `authenticated`. They were reachable through `/rest/v1/rpc/…`, i.e. anyone could trigger the
  UMAG sync or the snapshot archive. `pg_cron` runs them as `postgres`, so the schedules are unaffected.
- 8 `rbac_*` role-management RPCs: `EXECUTE` revoked from `public`, `anon` (signed-in admins keep access; the
  functions also check permissions inside). No policy or function depended on the anonymous grant (checked).
- Dropped two no-caller leftovers of the removed attendance module: `platform_haversine_meters`,
  `platform_get_employee_work_location`.
- `search_path = public, pg_temp` pinned on 9 utility functions flagged by the linter.

Postcheck: anon/authenticated cannot execute the scheduler functions, `postgres` can; `rbac_*` anon = false,
authenticated = true.

**Still manual (dashboard):** Auth → Password security → enable «Leaked password protection».

## 15b — unused accounts deleted (applied on prod)

Owner decision: the accounts of roles without any platform section (cashier, seller, floor administrator,
cleaner) and all already-terminated accounts are rubbish. Deleted **26 of 31** accounts (12 active, 14 terminated):

- `academy_users` rows and their `auth.users` records (one transaction, `no CASCADE` assumptions: the only FK
  into `academy_users` is `supplier_payment_obligations.platform_paid_by`, `ON DELETE SET NULL`).
- Preflight: none of the 26 was referenced by a payment mark, purchase order, receiving document / version / export
  or table setting — no business attribution lost.
- Built-in assertions in the transaction: exactly 26 targets and exactly the expected 5 accounts kept
  (2 administrators, accountant, buyer, receiver).
- 11 avatar files of the deleted accounts removed from `employee-avatars` (`storage rm`); 1 avatar remains.

No names, logins or ids are recorded here (the repository is public).

**Left for a decision:** the roles cashier / seller / floor administrator / cleaner have no users now; deleting
them (and `finansist_2`, also empty) would also need the built-in system-role list in `permissionCatalog.js`
updated.

## Next from the advisor list (not done)

Indexes for 17 unindexed foreign keys (notably `purchase_order_items.purchase_order_id`), 6 RLS policies that
re-evaluate `auth.uid()` per row, 20 unused indexes.
