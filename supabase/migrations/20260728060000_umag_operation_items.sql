-- Lazy-cached UMAG supply / supply-return product lines for settlements detail.
-- Single-tenant. Not populated during bulk umag-sync (avoid N+1).

select pg_advisory_xact_lock(202607280600);

-- ---------------------------------------------------------------------------
-- Parent cache metadata
-- ---------------------------------------------------------------------------

alter table public.umag_supplies
  add column if not exists items_synced_at timestamptz null,
  add column if not exists items_source_updated_at timestamptz null;

alter table public.umag_supply_returns
  add column if not exists items_synced_at timestamptz null,
  add column if not exists items_source_updated_at timestamptz null;

comment on column public.umag_supplies.items_synced_at is
  'When product lines were last fetched from UMAG (lazy detail cache).';
comment on column public.umag_supplies.items_source_updated_at is
  'umag_edit_time snapshot used for cache invalidation of supply items.';
comment on column public.umag_supply_returns.items_synced_at is
  'When return product lines were last fetched from UMAG (lazy detail cache).';
comment on column public.umag_supply_returns.items_source_updated_at is
  'umag_update_time snapshot used for cache invalidation of return items.';

-- ---------------------------------------------------------------------------
-- umag_supply_items
-- ---------------------------------------------------------------------------

create table if not exists public.umag_supply_items (
  id uuid primary key default gen_random_uuid(),
  umag_supply_id bigint not null,
  umag_supply_row_id uuid null references public.umag_supplies (id) on delete set null,
  umag_line_id bigint null,
  external_line_key text not null,
  umag_product_id bigint null,
  platform_product_id uuid null,
  product_name text not null default 'Без названия',
  barcode text null,
  unit text null,
  quantity numeric(20, 4) not null default 0,
  purchase_price numeric(20, 4) null,
  selling_price numeric(20, 4) null,
  line_amount numeric(20, 4) null,
  is_bonus boolean not null default false,
  sort_index integer not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  source_document_updated_at timestamptz null,
  is_source_deleted boolean not null default false,
  source_deleted_at timestamptz null,
  last_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint umag_supply_items_supply_line_unique unique (umag_supply_id, external_line_key)
);

create index if not exists idx_umag_supply_items_supply_id
  on public.umag_supply_items (umag_supply_id);
create index if not exists idx_umag_supply_items_active
  on public.umag_supply_items (umag_supply_id, sort_index)
  where is_source_deleted = false;
create index if not exists idx_umag_supply_items_product_id
  on public.umag_supply_items (umag_product_id)
  where umag_product_id is not null;

comment on table public.umag_supply_items is
  'Lazy-cached product lines for UMAG supplies. Populated on demand, not during period sync.';

drop trigger if exists umag_supply_items_updated_at on public.umag_supply_items;
create trigger umag_supply_items_updated_at
  before update on public.umag_supply_items
  for each row
  execute function public.academy_set_updated_at();

alter table public.umag_supply_items enable row level security;

revoke all on table public.umag_supply_items from public;
revoke all on table public.umag_supply_items from anon;
revoke all on table public.umag_supply_items from authenticated;
grant select on table public.umag_supply_items to authenticated;
grant all on table public.umag_supply_items to service_role;

drop policy if exists umag_supply_items_select_view on public.umag_supply_items;
create policy umag_supply_items_select_view
  on public.umag_supply_items
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('umag.settlements.view')
    or auth_private.current_user_has_permission('suppliers.view')
  );

-- ---------------------------------------------------------------------------
-- umag_supply_return_items
-- ---------------------------------------------------------------------------

create table if not exists public.umag_supply_return_items (
  id uuid primary key default gen_random_uuid(),
  umag_return_id bigint not null,
  umag_return_row_id uuid null references public.umag_supply_returns (id) on delete set null,
  umag_line_id bigint null,
  external_line_key text not null,
  umag_product_id bigint null,
  platform_product_id uuid null,
  product_name text not null default 'Без названия',
  barcode text null,
  unit text null,
  quantity numeric(20, 4) not null default 0,
  purchase_price numeric(20, 4) null,
  line_amount numeric(20, 4) null,
  is_bonus boolean not null default false,
  sort_index integer not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  source_document_updated_at timestamptz null,
  is_source_deleted boolean not null default false,
  source_deleted_at timestamptz null,
  last_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint umag_supply_return_items_return_line_unique unique (umag_return_id, external_line_key)
);

create index if not exists idx_umag_supply_return_items_return_id
  on public.umag_supply_return_items (umag_return_id);
create index if not exists idx_umag_supply_return_items_active
  on public.umag_supply_return_items (umag_return_id, sort_index)
  where is_source_deleted = false;
create index if not exists idx_umag_supply_return_items_product_id
  on public.umag_supply_return_items (umag_product_id)
  where umag_product_id is not null;

comment on table public.umag_supply_return_items is
  'Lazy-cached product lines for UMAG supply returns. Populated on demand, not during period sync.';

drop trigger if exists umag_supply_return_items_updated_at on public.umag_supply_return_items;
create trigger umag_supply_return_items_updated_at
  before update on public.umag_supply_return_items
  for each row
  execute function public.academy_set_updated_at();

alter table public.umag_supply_return_items enable row level security;

revoke all on table public.umag_supply_return_items from public;
revoke all on table public.umag_supply_return_items from anon;
revoke all on table public.umag_supply_return_items from authenticated;
grant select on table public.umag_supply_return_items to authenticated;
grant all on table public.umag_supply_return_items to service_role;

drop policy if exists umag_supply_return_items_select_view on public.umag_supply_return_items;
create policy umag_supply_return_items_select_view
  on public.umag_supply_return_items
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('umag.settlements.view')
    or auth_private.current_user_has_permission('suppliers.view')
  );
