-- Stage 20 preflight (read-only). Expect: director_exists=1, accounts_table=1,
-- columns_already=0, active_returns ≈ 209, and policy/grant checks informational.
select
  (select count(*) from public.academy_users where id = 1 and login = 'admin') as director_exists,
  (select count(*) from information_schema.tables where table_schema='public' and table_name='payment_accounts') as accounts_table,
  (select count(*) from information_schema.columns where table_schema='public' and table_name='umag_supply_returns' and column_name like 'platform_refund%') as columns_already,
  (select count(*) from public.umag_supply_returns where not is_source_deleted) as active_returns,
  (select count(*) from public.umag_supply_returns) as all_returns,
  (select count(*) from public.role_permissions rp join public.permissions p on p.id = rp.permission_id where p.code = 'supplier_payments.manage') as roles_with_manage;
