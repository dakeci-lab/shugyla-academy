-- Stage 24 preflight (read-only). Expect: the Edge functions are already deployed from the cleaned code, nothing else reads the objects below.
-- 1. Objects to drop exist: 2 tables, 3 functions, 5 columns, 1 permission.
select 'tables' k, count(*) from information_schema.tables where table_schema='public' and table_name in ('procurement_norm_rules','procurement_norm_changes')
union all select 'functions', count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('set_procurement_norm_rule_for_snapshot','get_procurement_norm_taxonomy','procurement_norm_rules_journal')
union all select 'columns', count(*) from information_schema.columns where table_schema='public' and table_name='procurement_snapshot_items' and column_name in ('reserve_status','norm_days','abc_qty','abc_revenue','abc_profit')
union all select 'permission', count(*) from public.permissions where code='procurement.norms.manage';
-- 2. No other function / view mentions them (expect only the two functions the migration replaces plus the 3 functions it drops):
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','auth_private') and p.prokind='f' and pg_get_functiondef(p.oid) ~* '(norm_days|abc_|reserve_status|procurement_norm)';
select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('v','m') and pg_get_viewdef(c.oid) ~* '(norm_days|abc_|reserve_status|procurement_norm)';
-- 3. The new sync inserts without norm_days: the latest snapshot after the function deploy has plan_status filled (trigger ran).
select count(*) filter (where plan_status is null) as items_without_plan_status from public.procurement_snapshot_items
where snapshot_id = (select id from public.procurement_snapshots order by created_at desc limit 1);
