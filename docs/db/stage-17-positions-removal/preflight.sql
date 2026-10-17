-- Stage 17 preflight: nothing should depend on positions before they are dropped. Expect all counts as noted.
select 'users_with_position_id (informational)' as check, count(*) from public.academy_users where position_id is not null;
select 'views_using_positions (expect 0)', count(*) from pg_views where schemaname='public' and definition ilike '%position%';
select 'functions_using_positions (expect 8 position_structure_* only)', count(*)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'position_structure%' or p.prosrc ilike '%positions%' or p.prosrc ilike '%position_groups%');
select 'other_fks_to_positions (expect 1: academy_users.position_id)', count(*)
  from pg_constraint where contype='f' and confrelid in ('public.positions'::regclass,'public.position_groups'::regclass) and conrelid <> 'public.positions'::regclass;
select 'private_schema_objects (expect 9 functions, used only by position_structure_*)', count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='position_structure_private';
