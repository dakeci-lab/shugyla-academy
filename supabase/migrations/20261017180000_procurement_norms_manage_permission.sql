-- Stage 16a: only the director may change stock norms (applied on prod 2026-10-17 via MCP as
-- `procurement_norms_manage_permission`).
--
-- The planner's «Соответствие норме запаса» scale is computed live from procurement_snapshot_items.norm_days and
-- is used to evaluate the buyer; letting the buyer edit the norms is a conflict of interest. Norms are now
-- guarded by a dedicated permission granted only to the role `admin` (Директор). The Edge Function `umag-procurement`
-- (`set_norm`) requires it; buyers keep read access through `procurement.view`.
--
-- Rollback: delete the role_permissions row (and optionally the permission) and redeploy the previous Edge Function.

select pg_advisory_xact_lock(202610171201);

insert into public.permissions (code, name, description, module, action, sort_order)
values (
  'procurement.norms.manage',
  'Управление нормами запаса',
  'Изменение норм запаса (дни) по категориям и подкатегориям в «Закупках → Нормы». По нормам считается шкала соответствия запаса.',
  'procurement',
  'norms_manage',
  105
)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'procurement.norms.manage'
where r.code = 'admin'
on conflict do nothing;
