-- Stage 7 — read-only table stats for workforce Edge DB phases.
-- Safe to run via: npx supabase db query --linked -f scripts/performance/stage7-table-stats.sql
-- No DDL / DML / ANALYZE.

select
  c.relname,
  s.n_live_tup,
  s.n_dead_tup,
  s.seq_scan,
  s.seq_tup_read,
  s.idx_scan,
  s.last_analyze,
  s.last_autoanalyze
from pg_stat_user_tables s
join pg_class c on c.oid = s.relid
where c.relname in (
  'academy_users',
  'academy_employee_shifts',
  'roles',
  'permissions',
  'role_permissions'
)
order by c.relname;

select
  c.relname,
  pg_size_pretty(pg_relation_size(c.oid)) as table_size,
  pg_size_pretty(pg_indexes_size(c.oid)) as indexes_size,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'academy_users',
    'academy_employee_shifts',
    'roles',
    'permissions',
    'role_permissions'
  )
order by c.relname;

select
  c.relname,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'academy_users',
    'academy_employee_shifts',
    'roles',
    'permissions',
    'role_permissions'
  )
order by c.relname;

select
  (select count(*) from public.academy_users) as users_total,
  (select count(*) from public.academy_users where status = 'active') as users_active,
  (select count(*) from public.academy_employee_shifts) as shifts_total,
  (select count(*) from public.permissions) as permissions_total,
  (select count(*) from public.role_permissions) as role_permissions_total,
  (select count(*) from public.roles) as roles_total;
