-- Stage 7 — EXPLAIN for Query B (permission lookup).
-- Mirrors Edge relational path:
--   permissions.select('code, role_permissions!inner(role_id)')
--     .in('code', uniqueCodes)
--     .eq('role_permissions.role_id', roleId)
-- Equivalent SQL JOIN used below (home-summary codes = schedule.view_team).

explain (format text)
select p.code
from public.permissions p
inner join public.role_permissions rp on rp.permission_id = p.id
where p.code in ('schedule.view_team')
  and rp.role_id = (
    select role_id
    from public.academy_users
    where role_id is not null
    limit 1
  );

-- Optional measured plan:
-- explain (analyze, buffers, format text)
-- select p.code
-- from public.permissions p
-- inner join public.role_permissions rp on rp.permission_id = p.id
-- where p.code in ('schedule.view_team')
--   and rp.role_id = (
--     select role_id
--     from public.academy_users
--     where role_id is not null
--     limit 1
--   );

-- Fallback Stage 4 path (2 queries), if needed for comparison:
-- explain (format text)
-- select id, code from public.permissions where code in ('schedule.view_team');
-- explain (format text)
-- select permission_id
-- from public.role_permissions
-- where role_id = '<ROLE_UUID>'
--   and permission_id in ('<PERMISSION_UUID>');
