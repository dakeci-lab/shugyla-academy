begin;
select pg_advisory_xact_lock(202610171901);
alter table public.academy_users drop column password;
drop table public.platform_work_locations;
commit;
