-- Secure procurement RLS: authenticated active employees only.
-- Replaces open anon/public USING (true) policies after Auth cutover.
-- Single-organization platform: any active linked employee may access purchases.

select pg_advisory_xact_lock(202607172100);

create schema if not exists auth_private;

create or replace function auth_private.current_employee_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.academy_users as au
      where au.auth_user_id = auth.uid()
        and au.status = 'active'
    );
$$;

comment on function auth_private.current_employee_is_active() is
  'True when auth.uid() maps to an active academy_users row. Used by procurement RLS.';

revoke all on function auth_private.current_employee_is_active() from public;
revoke all on function auth_private.current_employee_is_active() from anon;
grant execute on function auth_private.current_employee_is_active() to authenticated;
grant execute on function auth_private.current_employee_is_active() to service_role;

-- ---------------------------------------------------------------------------
-- purchase_orders
-- ---------------------------------------------------------------------------

alter table public.purchase_orders enable row level security;

drop policy if exists "Allow anon read write purchase_orders" on public.purchase_orders;
drop policy if exists "Allow read purchase_orders" on public.purchase_orders;
drop policy if exists "Allow insert purchase_orders" on public.purchase_orders;
drop policy if exists "Allow update purchase_orders" on public.purchase_orders;
drop policy if exists "Allow delete purchase_orders" on public.purchase_orders;

revoke all on table public.purchase_orders from anon;
revoke all on table public.purchase_orders from authenticated;
revoke truncate on table public.purchase_orders from anon;
revoke truncate on table public.purchase_orders from authenticated;

grant select, insert, update, delete on table public.purchase_orders to authenticated;
grant all on table public.purchase_orders to service_role;

drop policy if exists purchase_orders_select_active_employee on public.purchase_orders;
create policy purchase_orders_select_active_employee
  on public.purchase_orders
  for select
  to authenticated
  using (auth_private.current_employee_is_active());

drop policy if exists purchase_orders_insert_active_employee on public.purchase_orders;
create policy purchase_orders_insert_active_employee
  on public.purchase_orders
  for insert
  to authenticated
  with check (auth_private.current_employee_is_active());

drop policy if exists purchase_orders_update_active_employee on public.purchase_orders;
create policy purchase_orders_update_active_employee
  on public.purchase_orders
  for update
  to authenticated
  using (auth_private.current_employee_is_active())
  with check (auth_private.current_employee_is_active());

drop policy if exists purchase_orders_delete_active_employee on public.purchase_orders;
create policy purchase_orders_delete_active_employee
  on public.purchase_orders
  for delete
  to authenticated
  using (auth_private.current_employee_is_active());

-- ---------------------------------------------------------------------------
-- purchase_order_items
-- ---------------------------------------------------------------------------

alter table public.purchase_order_items enable row level security;

drop policy if exists "Allow read purchase_order_items" on public.purchase_order_items;
drop policy if exists "Allow insert purchase_order_items" on public.purchase_order_items;
drop policy if exists "Allow update purchase_order_items" on public.purchase_order_items;
drop policy if exists "Allow delete purchase_order_items" on public.purchase_order_items;

revoke all on table public.purchase_order_items from anon;
revoke all on table public.purchase_order_items from authenticated;
revoke truncate on table public.purchase_order_items from anon;
revoke truncate on table public.purchase_order_items from authenticated;

grant select, insert, update, delete on table public.purchase_order_items to authenticated;
grant all on table public.purchase_order_items to service_role;

drop policy if exists purchase_order_items_select_active_employee on public.purchase_order_items;
create policy purchase_order_items_select_active_employee
  on public.purchase_order_items
  for select
  to authenticated
  using (auth_private.current_employee_is_active());

drop policy if exists purchase_order_items_insert_active_employee on public.purchase_order_items;
create policy purchase_order_items_insert_active_employee
  on public.purchase_order_items
  for insert
  to authenticated
  with check (auth_private.current_employee_is_active());

drop policy if exists purchase_order_items_update_active_employee on public.purchase_order_items;
create policy purchase_order_items_update_active_employee
  on public.purchase_order_items
  for update
  to authenticated
  using (auth_private.current_employee_is_active())
  with check (auth_private.current_employee_is_active());

drop policy if exists purchase_order_items_delete_active_employee on public.purchase_order_items;
create policy purchase_order_items_delete_active_employee
  on public.purchase_order_items
  for delete
  to authenticated
  using (auth_private.current_employee_is_active());

-- ---------------------------------------------------------------------------
-- receiving_documents
-- ---------------------------------------------------------------------------

alter table public.receiving_documents enable row level security;

drop policy if exists "Allow anon read write receiving_documents" on public.receiving_documents;
drop policy if exists "Allow read receiving_documents" on public.receiving_documents;
drop policy if exists "Allow insert receiving_documents" on public.receiving_documents;
drop policy if exists "Allow update receiving_documents" on public.receiving_documents;
drop policy if exists "Allow delete receiving_documents" on public.receiving_documents;

revoke all on table public.receiving_documents from anon;
revoke all on table public.receiving_documents from authenticated;
revoke truncate on table public.receiving_documents from anon;
revoke truncate on table public.receiving_documents from authenticated;

grant select, insert, update, delete on table public.receiving_documents to authenticated;
grant all on table public.receiving_documents to service_role;

drop policy if exists receiving_documents_select_active_employee on public.receiving_documents;
create policy receiving_documents_select_active_employee
  on public.receiving_documents
  for select
  to authenticated
  using (auth_private.current_employee_is_active());

drop policy if exists receiving_documents_insert_active_employee on public.receiving_documents;
create policy receiving_documents_insert_active_employee
  on public.receiving_documents
  for insert
  to authenticated
  with check (auth_private.current_employee_is_active());

drop policy if exists receiving_documents_update_active_employee on public.receiving_documents;
create policy receiving_documents_update_active_employee
  on public.receiving_documents
  for update
  to authenticated
  using (auth_private.current_employee_is_active())
  with check (auth_private.current_employee_is_active());

drop policy if exists receiving_documents_delete_active_employee on public.receiving_documents;
create policy receiving_documents_delete_active_employee
  on public.receiving_documents
  for delete
  to authenticated
  using (auth_private.current_employee_is_active());

-- ---------------------------------------------------------------------------
-- receiving_items
-- ---------------------------------------------------------------------------

alter table public.receiving_items enable row level security;

drop policy if exists "Allow read receiving_items" on public.receiving_items;
drop policy if exists "Allow insert receiving_items" on public.receiving_items;
drop policy if exists "Allow update receiving_items" on public.receiving_items;
drop policy if exists "Allow delete receiving_items" on public.receiving_items;

revoke all on table public.receiving_items from anon;
revoke all on table public.receiving_items from authenticated;
revoke truncate on table public.receiving_items from anon;
revoke truncate on table public.receiving_items from authenticated;

grant select, insert, update, delete on table public.receiving_items to authenticated;
grant all on table public.receiving_items to service_role;

drop policy if exists receiving_items_select_active_employee on public.receiving_items;
create policy receiving_items_select_active_employee
  on public.receiving_items
  for select
  to authenticated
  using (auth_private.current_employee_is_active());

drop policy if exists receiving_items_insert_active_employee on public.receiving_items;
create policy receiving_items_insert_active_employee
  on public.receiving_items
  for insert
  to authenticated
  with check (auth_private.current_employee_is_active());

drop policy if exists receiving_items_update_active_employee on public.receiving_items;
create policy receiving_items_update_active_employee
  on public.receiving_items
  for update
  to authenticated
  using (auth_private.current_employee_is_active())
  with check (auth_private.current_employee_is_active());

drop policy if exists receiving_items_delete_active_employee on public.receiving_items;
create policy receiving_items_delete_active_employee
  on public.receiving_items
  for delete
  to authenticated
  using (auth_private.current_employee_is_active());

notify pgrst, 'reload schema';
