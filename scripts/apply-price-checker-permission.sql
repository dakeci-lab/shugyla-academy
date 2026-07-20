-- Safe SQL for Supabase SQL Editor (remote).
-- Idempotent: does not delete existing permissions/roles.
-- Grants products.price_checker.view ONLY to role code = 'admin'.

insert into public.permissions (code, name, module, sort_order)
values ('products.price_checker.view', 'Прайс-чекер', 'products', 135)
on conflict (code) do update
set
  name = excluded.name,
  module = excluded.module,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'admin'
  and p.code = 'products.price_checker.view'
on conflict (role_id, permission_id) do nothing;

-- Verification (read-only):
-- 1) permission exists
select code, name, module, sort_order
from public.permissions
where code = 'products.price_checker.view';

-- 2) which roles have it (expect only admin)
select r.code as role_code, p.code as permission_code
from public.role_permissions rp
join public.roles r on r.id = rp.role_id
join public.permissions p on p.id = rp.permission_id
where p.code = 'products.price_checker.view'
order by r.code;
