-- Owner decision (2026-09-19), ahead of merging «Поставщики» directory into
-- «Взаиморасчёты»: закупщик plans purchase orders and should see supplier
-- settlement totals/history, not just contacts — grant umag.settlements.view.
-- Финансист is an administrative role over the supplier module too — grant
-- full suppliers.view/suppliers.edit, matching Бухгалтер/Директор.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'buyer'
  and p.code = 'umag.settlements.view'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'finansist_2'
  and p.code in ('suppliers.view', 'suppliers.edit')
on conflict (role_id, permission_id) do nothing;
