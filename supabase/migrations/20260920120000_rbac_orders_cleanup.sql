-- RBAC cleanup after «Приёмка» was merged into «Заказы» (2026-09-20).
--
-- 1. receiving.manage is retired: the accept flow is gone from the UI (goods are
--    accepted in UMAG). The write RPCs that require it stay in the database but
--    are now denied to everyone except admins; read policies keep working
--    through receiving.view.
-- 2. receiving.view now means «view orders (read-only)»; procurement.transfer is
--    still required by umag-procurement together with procurement.create.
-- 3. Floor administrators lose the HR permissions (owner decision 2026-09-20).
-- 4. Stale role descriptions are refreshed.

select pg_advisory_xact_lock(202609201200);

-- 1. retire receiving.manage
delete from public.role_permissions
where permission_id in (select id from public.permissions where code = 'receiving.manage');

delete from public.permissions where code = 'receiving.manage';

-- 2. rename what stays
update public.permissions
set name = 'Просмотр заказов',
    description = 'Список и карточки заказов, только чтение'
where code = 'receiving.view';

update public.permissions
set name = 'Формирование заказов из планирования',
    description = 'Формирование заказов поставщикам из планирования закупа'
where code = 'procurement.transfer';

-- 3. floor administrators: no HR
delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.code = 'floor_admin'
  and p.code like 'recruitment.%';

-- 4. role descriptions
update public.roles set description = 'Закуп, заказы, поставщики.' where code = 'buyer';
update public.roles set description = 'Просмотр ожидаемых поставок (заказов).' where code = 'receiver';
update public.roles set description = 'График работы команды.' where code = 'floor_admin';
