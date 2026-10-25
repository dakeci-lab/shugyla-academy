-- Stage 24 postcheck (read-only). Expect all zero.
select 'tables' k, count(*) from information_schema.tables where table_schema='public' and table_name in ('procurement_norm_rules','procurement_norm_changes')
union all select 'functions', count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('set_procurement_norm_rule_for_snapshot','get_procurement_norm_taxonomy','procurement_norm_rules_journal')
union all select 'columns', count(*) from information_schema.columns where table_schema='public' and table_name='procurement_snapshot_items' and column_name in ('reserve_status','norm_days','abc_qty','abc_revenue','abc_profit')
union all select 'permission', count(*) from public.permissions where code='procurement.norms.manage';
-- The planner still works: stock-health numbers come back.
select * from public.get_procurement_snapshot_stock_health((select id from public.procurement_snapshots order by created_at desc limit 1));
