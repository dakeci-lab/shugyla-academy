-- Stage 22 preflight (read-only). Expect: 0 rows for the columns, 20 columns in purchase_orders.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'purchase_orders' and column_name in ('checked_at', 'checked_by_name');
