-- Stage 20 postcheck. Expect: unmarked=0, marked = all_returns, by_director = marked,
-- update_grant_columns = 3, update_policy = 1.
select
  (select count(*) from public.umag_supply_returns where platform_refunded_at is null) as unmarked,
  (select count(*) from public.umag_supply_returns where platform_refunded_at is not null) as marked,
  (select count(*) from public.umag_supply_returns where platform_refunded_by = 1) as by_director,
  (select count(*) from information_schema.column_privileges where table_schema='public' and table_name='umag_supply_returns' and grantee='authenticated' and privilege_type='UPDATE') as update_grant_columns,
  (select count(*) from pg_policies where schemaname='public' and tablename='umag_supply_returns' and policyname='umag_supply_returns_update_refund_mark') as update_policy;
