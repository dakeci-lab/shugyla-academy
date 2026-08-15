-- Harden public.platform_suppliers RLS: authenticated permission checks only.
-- Replaces leftover open policies (roles={public}, USING/WITH CHECK true) and
-- anon table DML. service_role keeps ALL (Edge umag-procurement / umag-sync).
-- Does not copy data. Does not touch other tables.

select pg_advisory_xact_lock(202608150954);

-- ---------------------------------------------------------------------------
-- Drop known legacy permissive policies (names from original module + splits)
-- ---------------------------------------------------------------------------

drop policy if exists "Allow anon read write platform_suppliers" on public.platform_suppliers;
drop policy if exists "Allow anon read write suppliers" on public.platform_suppliers;
drop policy if exists "Allow read write platform_suppliers" on public.platform_suppliers;
drop policy if exists "Allow read suppliers" on public.platform_suppliers;
drop policy if exists "Allow insert suppliers" on public.platform_suppliers;
drop policy if exists "Allow update suppliers" on public.platform_suppliers;
drop policy if exists "Allow delete suppliers" on public.platform_suppliers;
drop policy if exists "Allow read platform_suppliers" on public.platform_suppliers;
drop policy if exists "Allow insert platform_suppliers" on public.platform_suppliers;
drop policy if exists "Allow update platform_suppliers" on public.platform_suppliers;
drop policy if exists "Allow delete platform_suppliers" on public.platform_suppliers;
drop policy if exists platform_suppliers_select_permission on public.platform_suppliers;
drop policy if exists platform_suppliers_insert_create on public.platform_suppliers;
drop policy if exists platform_suppliers_update_edit on public.platform_suppliers;
drop policy if exists platform_suppliers_delete_permission on public.platform_suppliers;

-- Any leftover policy on this table (renamed FOR ALL / per-command USING true).
do $$
declare
  v_policy text;
begin
  for v_policy in
    select p.policyname
    from pg_policies as p
    where p.schemaname = 'public'
      and p.tablename = 'platform_suppliers'
  loop
    execute format(
      'drop policy if exists %I on public.platform_suppliers',
      v_policy
    );
  end loop;
end
$$;

alter table public.platform_suppliers enable row level security;

revoke all on table public.platform_suppliers from public;
revoke all on table public.platform_suppliers from anon;
revoke all on table public.platform_suppliers from authenticated;
revoke truncate on table public.platform_suppliers from public;
revoke truncate on table public.platform_suppliers from anon;
revoke truncate on table public.platform_suppliers from authenticated;

grant select, insert, update, delete on table public.platform_suppliers to authenticated;
grant all on table public.platform_suppliers to service_role;

-- SELECT: view plus writers/deleters so editors can load the row they change.
create policy platform_suppliers_select_permission
  on public.platform_suppliers
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('suppliers.view')
    or auth_private.current_user_has_permission('suppliers.create')
    or auth_private.current_user_has_permission('suppliers.edit')
    or auth_private.current_user_has_permission('suppliers.delete')
  );

create policy platform_suppliers_insert_create
  on public.platform_suppliers
  for insert
  to authenticated
  with check (auth_private.current_user_has_permission('suppliers.create'));

create policy platform_suppliers_update_edit
  on public.platform_suppliers
  for update
  to authenticated
  using (auth_private.current_user_has_permission('suppliers.edit'))
  with check (auth_private.current_user_has_permission('suppliers.edit'));

create policy platform_suppliers_delete_permission
  on public.platform_suppliers
  for delete
  to authenticated
  using (auth_private.current_user_has_permission('suppliers.delete'));

comment on table public.platform_suppliers is
  'Canonical suppliers. RLS: authenticated suppliers.view/create/edit/delete; anon none; service_role ALL.';
