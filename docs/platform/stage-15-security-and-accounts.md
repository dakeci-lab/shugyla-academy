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

## 15c — empty roles deleted (applied on prod, 2026-10-17)

Roles with no users and no platform sections: `cashier`, `seller`, `floor_admin`, `tehnichka`, `finansist_2`
(5 rows in `roles`; `role_permissions` cascade). The transaction asserted that none had users and that exactly 5
rows matched. Roles left: `admin`, `buyer`, `receiver`, `buhgalter`. The frontend catalog lost the three built-in
system roles `cashier` / `seller` / `floor_admin` and their default grants (`RBAC_SYSTEM_ROLES`,
`RBAC_DEFAULT_ROLE_PERMISSIONS`); the legacy role-code constants stay so old links/sessions still resolve to
«no sections».

## 15d — foreign-key indexes (applied on prod, 2026-10-17)

`supabase/migrations/20261017160000_index_foreign_keys_procurement_receiving.sql`: 16 indexes on foreign keys from
the performance advisor (purchase order items / orders, receiving items / documents / versions / exports, payment
obligations, supply items, match candidates).

**Measured honestly:** the database side of loading order items was never the main cost. Before: seq scan, 20 ms
for the 100 newest orders (8.8 k rows); after: index scan, 10 ms, and it no longer grows with the table. The ~0.8 s per
request seen from the browser is network + PostgREST/RLS overhead, so don't expect a large load-time change from this.

## Still open

- 6 RLS policies that re-evaluate `auth.uid()` per row (`user_table_settings`, `academy_users`), 20 unused indexes.
- Dashboard: enable «Leaked password protection».


## 15e — last two terminated accounts deleted (2026-10-17)

The receiver and the accountant accounts, switched to «terminated» by the owner on 2026-10-17, were deleted after the
owner's explicit confirmation (same transaction pattern: asserted no payment marks / orders / receiving documents
referenced them, and exactly the 3 expected accounts remain). Their avatar was removed too.

**State now:** 3 accounts (2 administrators, 1 buyer). Roles `buhgalter` and `receiver` exist but have no users;
they were kept on purpose so a new receiver / accountant can be created later.
