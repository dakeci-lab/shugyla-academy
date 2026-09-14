-- Payment accounts: user-managed reference list for "способ оплаты" поставщика.
-- Standalone module — no consumers yet. Suppliers keep using payment_type/deferral_days
-- until a follow-up PR wires platform_suppliers.payment_account_id to this table.
-- See docs/suppliers/payment-accounts-module.md.

select pg_advisory_xact_lock(202609141200);

-- ---------------------------------------------------------------------------
-- Permissions — separate right from suppliers.edit, matching roles.* precedent
-- (accounts are a shared global reference list, not per-supplier data).
-- ---------------------------------------------------------------------------

insert into public.permissions (code, name, module, sort_order)
values
  ('payment_accounts.view', 'Просмотр счетов оплаты', 'payment_accounts', 163),
  ('payment_accounts.manage', 'Управление счетами оплаты', 'payment_accounts', 164)
on conflict (code) do update
set
  name = excluded.name,
  module = excluded.module,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'admin'
  and p.code in ('payment_accounts.view', 'payment_accounts.manage')
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- payment_accounts
-- ---------------------------------------------------------------------------

create table if not exists public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_accounts_name_not_blank check (btrim(name) <> '')
);

-- Case/whitespace-insensitive uniqueness — prevents "Наличные" and "наличные " coexisting.
create unique index if not exists idx_payment_accounts_name_ci
  on public.payment_accounts (lower(btrim(name)));

create index if not exists idx_payment_accounts_is_active
  on public.payment_accounts (is_active);

comment on table public.payment_accounts is
  'User-managed list of payment methods/accounts ("Наличные", "Kaspi", ...). Soft-delete via is_active; never hard-deleted so historical references stay resolvable.';

drop trigger if exists payment_accounts_updated_at on public.payment_accounts;
create trigger payment_accounts_updated_at
  before update on public.payment_accounts
  for each row
  execute function public.academy_set_updated_at();

alter table public.payment_accounts enable row level security;

revoke all on table public.payment_accounts from public;
revoke all on table public.payment_accounts from anon;
revoke all on table public.payment_accounts from authenticated;
grant select, insert, update on table public.payment_accounts to authenticated;
grant all on table public.payment_accounts to service_role;

-- World-readable, same as roles/permissions — every signed-in user may need to
-- see account names (e.g. a future supplier-form dropdown); only mutation is gated.
drop policy if exists payment_accounts_select on public.payment_accounts;
create policy payment_accounts_select
  on public.payment_accounts
  for select
  to authenticated
  using (true);

drop policy if exists payment_accounts_insert on public.payment_accounts;
create policy payment_accounts_insert
  on public.payment_accounts
  for insert
  to authenticated
  with check (auth_private.current_user_has_permission('payment_accounts.manage'));

drop policy if exists payment_accounts_update on public.payment_accounts;
create policy payment_accounts_update
  on public.payment_accounts
  for update
  to authenticated
  using (auth_private.current_user_has_permission('payment_accounts.manage'))
  with check (auth_private.current_user_has_permission('payment_accounts.manage'));

-- ---------------------------------------------------------------------------
-- Seed — two starting accounts matching today's cash/transfer split. Freely
-- renameable/deactivatable, not system-protected: the owner explicitly wants
-- full flexibility to add/rename/retire accounts (wallets, banks, etc.) later.
-- ---------------------------------------------------------------------------

insert into public.payment_accounts (name, sort_order)
select v.name, v.sort_order
from (values ('Наличные', 10), ('Перевод', 20)) as v(name, sort_order)
where not exists (
  select 1 from public.payment_accounts pa where lower(btrim(pa.name)) = lower(v.name)
);
