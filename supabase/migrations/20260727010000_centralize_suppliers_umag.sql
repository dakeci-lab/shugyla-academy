-- Centralize suppliers: platform_suppliers remains canonical; umag_suppliers stays mirror.
-- Matching: existing umag_supplier_id, then unique BIN only. No automatic name merge.
-- Single-tenant: UNIQUE(umag_supplier_id) on platform_suppliers.

select pg_advisory_xact_lock(202607270100);

-- ---------------------------------------------------------------------------
-- 1. Canonical platform_suppliers: UMAG link + UMAG-owned fields
-- ---------------------------------------------------------------------------

alter table public.platform_suppliers
  add column if not exists umag_supplier_id bigint null,
  add column if not exists bin text null,
  add column if not exists umag_phone text null,
  add column if not exists actual_address text null,
  add column if not exists legal_address text null,
  add column if not exists is_umag_active boolean not null default true,
  add column if not exists umag_last_synced_at timestamptz null;

create unique index if not exists uq_platform_suppliers_umag_supplier_id
  on public.platform_suppliers (umag_supplier_id)
  where umag_supplier_id is not null;

create index if not exists idx_platform_suppliers_bin
  on public.platform_suppliers (bin)
  where bin is not null;

comment on column public.platform_suppliers.umag_supplier_id is
  'External UMAG agent/supplier id. Stable mapping to umag_suppliers.umag_supplier_id.';
comment on column public.platform_suppliers.bin is
  'UMAG-owned BIN/IIN when linked; may be backfilled from legacy comment.';
comment on column public.platform_suppliers.umag_phone is
  'UMAG-owned phone. Distinct from manager_phone (Shugyla operational).';
comment on column public.platform_suppliers.is_umag_active is
  'False when UMAG agent is deleted/absent from active supplier sync. Never hard-deletes the row.';

-- ---------------------------------------------------------------------------
-- 2. umag_supplies → canonical platform supplier
-- ---------------------------------------------------------------------------

alter table public.umag_supplies
  add column if not exists platform_supplier_id uuid null
    references public.platform_suppliers (id) on delete set null;

create index if not exists idx_umag_supplies_platform_supplier_id
  on public.umag_supplies (platform_supplier_id);

-- ---------------------------------------------------------------------------
-- 3. supplier_reconciliations.supplier_id → platform_suppliers (0 rows today)
-- ---------------------------------------------------------------------------

alter table public.supplier_reconciliations
  drop constraint if exists supplier_reconciliations_supplier_id_fkey;

alter table public.supplier_reconciliations
  add constraint supplier_reconciliations_supplier_id_fkey
  foreign key (supplier_id) references public.platform_suppliers (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 4. Potential duplicates (name signals only — never auto-merged)
-- ---------------------------------------------------------------------------

create table if not exists public.supplier_umag_match_candidates (
  id uuid primary key default gen_random_uuid(),
  umag_supplier_id bigint not null,
  platform_supplier_id uuid not null
    references public.platform_suppliers (id) on delete cascade,
  match_reason text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  constraint supplier_umag_match_candidates_reason_check check (
    match_reason in ('exact_name')
  ),
  constraint supplier_umag_match_candidates_status_check check (
    status in ('open', 'accepted', 'dismissed')
  ),
  constraint supplier_umag_match_candidates_unique
    unique (umag_supplier_id, platform_supplier_id, match_reason)
);

create index if not exists idx_supplier_umag_match_candidates_status
  on public.supplier_umag_match_candidates (status);

alter table public.supplier_umag_match_candidates enable row level security;

revoke all on table public.supplier_umag_match_candidates from public;
revoke all on table public.supplier_umag_match_candidates from anon;
revoke all on table public.supplier_umag_match_candidates from authenticated;
grant select on table public.supplier_umag_match_candidates to authenticated;
grant all on table public.supplier_umag_match_candidates to service_role;

drop policy if exists supplier_umag_match_candidates_select on public.supplier_umag_match_candidates;
create policy supplier_umag_match_candidates_select
  on public.supplier_umag_match_candidates
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('suppliers.view')
    or auth_private.current_user_has_permission('umag.settlements.view')
  );

-- ---------------------------------------------------------------------------
-- 5. Sync run counters for canonical reconciliation
-- ---------------------------------------------------------------------------

alter table public.umag_sync_runs
  add column if not exists source_suppliers_received integer null,
  add column if not exists canonical_created integer null,
  add column if not exists canonical_updated integer null,
  add column if not exists linked_by_external_id integer null,
  add column if not exists linked_by_bin integer null,
  add column if not exists potential_duplicates integer null,
  add column if not exists mapping_errors integer null;

-- ---------------------------------------------------------------------------
-- 6. Backfill: extract BIN from legacy comment, link by unique BIN, create rest
-- ---------------------------------------------------------------------------

do $$
declare
  v_linked_by_bin int := 0;
  v_created int := 0;
  v_updated_umag_fields int := 0;
  v_duplicates int := 0;
  v_supplies_mapped int := 0;
  v_supplies_total int := 0;
  v_platform_before int := 0;
  v_platform_after int := 0;
begin
  select count(*) into v_platform_before from public.platform_suppliers;

  -- Populate structured bin from legacy import comment when empty
  update public.platform_suppliers p
  set bin = nullif(trim(substring(p.comment from 'ИИН/БИН:\s*([0-9A-Za-z]+)')), '')
  where (p.bin is null or trim(p.bin) = '')
    and p.comment is not null
    and substring(p.comment from 'ИИН/БИН:\s*([0-9A-Za-z]+)') is not null;

  -- Link by unique BIN (both sides cardinality = 1)
  with plat_bins as (
    select bin, (array_agg(id))[1] as platform_id, count(*) as c
    from public.platform_suppliers
    where bin is not null and trim(bin) <> ''
      and umag_supplier_id is null
    group by bin
    having count(*) = 1
  ),
  umag_bins as (
    select nullif(trim(bin), '') as bin, (array_agg(umag_supplier_id))[1] as umag_id, count(*) as c
    from public.umag_suppliers
    where bin is not null and trim(bin) <> ''
    group by nullif(trim(bin), '')
    having count(*) = 1
  ),
  matches as (
    select p.platform_id, u.umag_id, u.bin
    from plat_bins p
    join umag_bins u on u.bin = p.bin
  )
  update public.platform_suppliers ps
  set
    umag_supplier_id = m.umag_id,
    bin = coalesce(nullif(trim(ps.bin), ''), m.bin),
    legal_name = coalesce(us.legal_name, ps.legal_name),
    umag_phone = us.phone,
    actual_address = us.actual_address,
    legal_address = us.legal_address,
    name = coalesce(nullif(trim(us.name), ''), ps.name),
    is_umag_active = not coalesce(us.is_deleted, false),
    umag_last_synced_at = coalesce(us.last_synced_at, now())
  from matches m
  join public.umag_suppliers us on us.umag_supplier_id = m.umag_id
  where ps.id = m.platform_id;

  get diagnostics v_linked_by_bin = row_count;

  -- Create canonical suppliers for remaining UMAG agents (no name auto-merge)
  insert into public.platform_suppliers (
    name,
    legal_name,
    bin,
    umag_phone,
    actual_address,
    legal_address,
    umag_supplier_id,
    is_umag_active,
    umag_last_synced_at,
    manager_name,
    manager_phone,
    order_days,
    delivery_days,
    product_categories,
    payment_type,
    return_policy,
    status,
    comment
  )
  select
    coalesce(nullif(trim(u.name), ''), 'Поставщик ' || u.umag_supplier_id),
    u.legal_name,
    nullif(trim(u.bin), ''),
    u.phone,
    u.actual_address,
    u.legal_address,
    u.umag_supplier_id,
    not coalesce(u.is_deleted, false),
    coalesce(u.last_synced_at, now()),
    '',
    '',
    '',
    '',
    '[]'::jsonb,
    'cash',
    'no',
    case when coalesce(u.is_deleted, false) then 'inactive' else 'active' end,
    null
  from public.umag_suppliers u
  where not exists (
    select 1
    from public.platform_suppliers p
    where p.umag_supplier_id = u.umag_supplier_id
  );

  get diagnostics v_created = row_count;

  -- Potential duplicates AFTER create:
  -- unlinked local row shares exact name with an UMAG agent that already has a different linked canonical row.
  -- Name is never used for automatic merge — only for manual review signals.
  insert into public.supplier_umag_match_candidates (
    umag_supplier_id,
    platform_supplier_id,
    match_reason,
    status
  )
  select
    u.umag_supplier_id,
    p.id,
    'exact_name',
    'open'
  from public.umag_suppliers u
  join public.platform_suppliers p
    on lower(trim(p.name)) = lower(trim(u.name))
  where p.umag_supplier_id is null
    and exists (
      select 1
      from public.platform_suppliers linked
      where linked.umag_supplier_id = u.umag_supplier_id
        and linked.id is distinct from p.id
    )
    and (
      select count(*) from public.umag_suppliers u2
      where lower(trim(u2.name)) = lower(trim(u.name))
    ) = 1
  on conflict (umag_supplier_id, platform_supplier_id, match_reason) do nothing;

  get diagnostics v_duplicates = row_count;

  -- Map supplies → canonical
  update public.umag_supplies s
  set platform_supplier_id = p.id
  from public.platform_suppliers p
  where s.umag_supplier_id = p.umag_supplier_id
    and s.platform_supplier_id is distinct from p.id;

  get diagnostics v_supplies_mapped = row_count;

  select count(*) into v_supplies_total from public.umag_supplies;
  select count(*) into v_platform_after from public.platform_suppliers;

  -- Count linked rows that received UMAG field refresh during BIN link
  select count(*) into v_updated_umag_fields
  from public.platform_suppliers
  where umag_supplier_id is not null;

  raise notice 'centralize_suppliers platform_before=% platform_after=% linked_by_bin=% created=% potential_duplicates=% supplies_mapped=% supplies_total=% linked_total=%',
    v_platform_before, v_platform_after, v_linked_by_bin, v_created, v_duplicates,
    v_supplies_mapped, v_supplies_total, v_updated_umag_fields;
end $$;
