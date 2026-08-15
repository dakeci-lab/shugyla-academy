# Harden platform_suppliers RLS

Дата: 2026-08-15
Миграция: `supabase/migrations/20260815095402_secure_platform_suppliers_rls.sql`

Production read-only finding: `public.platform_suppliers` had RLS enabled, but leftover policies with `roles={public}` and `qual/with_check=true`, and `anon` held SELECT/INSERT/UPDATE/DELETE. This migration closes that hole.

**Прод / remote Supabase не трогаем в этом PR.** Нет `db push`, `functions deploy`, `link`, merge.

## Audit (compatibility)

- UI CRUD goes through `src/services/suppliersSupabaseAdapter.js` → `src/lib/supabaseClient.js` (anon key + **user session** after login). `/platform/*` is behind `ProtectedRoute`.
- `umag-procurement` and `umag-sync` use `authorizeWorkforceRequest` → `serviceClient` (`SUPABASE_SERVICE_ROLE_KEY`). They bypass RLS. Unaffected.
- Public careers/corporate (`CorporateHome`, `/apply`) do **not** read `platform_suppliers`. No anonymous public supplier workflow — semantics can change.

Default buyer role already has `suppliers.view/create/edit/delete`. Receiver does **not**; receiving pages that prefetch the suppliers module will see an empty catalog after RLS (denormalized `supplier_name` on documents remains). UI `canDeleteSuppliers` currently follows edit/create; RLS DELETE requires `suppliers.delete` (default buyer has it).

## Deploy order

Do not reverse Edge vs migrations. Production apply is manual later, not from Cursor.

1. **Supplier hardening:** `supabase/migrations/20260815095402_secure_platform_suppliers_rls.sql`
2. **ABC migration if fresh environment** (not yet applied): `supabase/migrations/20260815072607_procurement_abc_analysis.sql`
3. **Then Edge:** `umag-procurement`

Timestamp order if both are missing: ABC `20260815072607` then this hardening `20260815095402`, then Edge. Hardening does not depend on ABC columns and can run alone on an environment that already has suppliers + `auth_private.current_user_has_permission`.

## Contract

- Drop known legacy policies (`Allow anon read write platform_suppliers`, `Allow read/insert/update/delete suppliers`, plus old `platform_suppliers` spellings) and any leftover policy on this table.
- `revoke all` from `public` / `anon`; no anon grants; no `USING (true)`.
- `authenticated`: `SELECT, INSERT, UPDATE, DELETE` (not `ALL`).
- `service_role`: `ALL`.
- RLS `TO authenticated`: SELECT if `suppliers.view|create|edit|delete`; INSERT `suppliers.create`; UPDATE `suppliers.edit`; DELETE `suppliers.delete`. Helper `auth_private.current_user_has_permission` is fully qualified and fail-closed.

## Проверка

```bash
npm run verify:secure-platform-suppliers-rls
npm run verify:procurement-abc-analysis
npm run verify:procurement-planning-v1
```
