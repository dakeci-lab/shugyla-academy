-- Stage 7 — read-only index inventory for workforce-related tables.
-- No DDL / DML.

select
  t.relname as table_name,
  i.relname as index_name,
  ix.indisunique as is_unique,
  pg_get_indexdef(ix.indexrelid) as index_def,
  coalesce(s.idx_scan, 0) as idx_scan,
  coalesce(s.idx_tup_read, 0) as idx_tup_read,
  coalesce(s.idx_tup_fetch, 0) as idx_tup_fetch
from pg_index ix
join pg_class i on i.oid = ix.indexrelid
join pg_class t on t.oid = ix.indrelid
join pg_namespace n on n.oid = t.relnamespace
left join pg_stat_user_indexes s on s.indexrelid = ix.indexrelid
where n.nspname = 'public'
  and t.relname in (
    'academy_users',
    'academy_employee_shifts',
    'roles',
    'permissions',
    'role_permissions'
  )
order by t.relname, i.relname;
