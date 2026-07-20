-- Price checker: admin-only permission for UMAG barcode lookup

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
