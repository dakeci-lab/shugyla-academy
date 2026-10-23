-- Stage 22 postcheck (read-only). Expect: both columns (timestamptz / text, nullable), both granted UPDATE to authenticated,
-- no row has a mark yet.
select column_name, data_type, is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'purchase_orders' and column_name in ('checked_at', 'checked_by_name');
select column_name from information_schema.column_privileges
where table_schema = 'public' and table_name = 'purchase_orders' and grantee = 'authenticated'
  and privilege_type = 'UPDATE' and column_name in ('checked_at', 'checked_by_name');
select count(*) filter (where checked_at is not null) as marked from public.purchase_orders;
