-- ---------------------------------------------------------------------------
-- Owner decision (2026-09-12): procurement_snapshot_items had grown to 302 MB
-- (77% of the entire 500 MB free-tier database, Fair Use Policy already
-- active) because every UMAG sync creates an entirely new immutable
-- snapshot + ~8000 item rows and nothing ever prunes old ones. The daily
-- 07:00 (Aqtobe) auto-sync (20260902090000) only accelerates this.
--
-- Fix, in order of what survives:
--   1. A tiny per-category daily rollup (procurement_snapshot_category_rollup)
--      stays in Postgres forever — cheap, covers trend analytics (stock
--      value, negative/orderable counts, reserve_status mix per category
--      per day) without needing raw per-SKU rows.
--   2. Before deleting a snapshot's items, the procurement-archive Edge
--      Function exports them to a gzipped CSV in the new private
--      `procurement-snapshot-archives` Storage bucket — Storage has its own
--      separate 1 GB quota (currently ~7% used), so this doesn't just move
--      the problem.
--   3. Only then are the raw item rows deleted. The snapshot's own header
--      row (procurement_snapshots — status, counts, dates, user) is never
--      touched, so «Склад»'s history list keeps working; only very old
--      rows' detail view/live Excel export change (see archive_path below).
--
-- Safety (see architecture audit before this migration): never archives the
-- single latest 'ready'/'generated' snapshot (the live Планирование/ABC/
-- Нормы views always read "the latest snapshot" — pruning it would break
-- them), and never touches 'partially_generated' or 'syncing' snapshots at
-- all (an old partially_generated snapshot could theoretically still be
-- resumed via the generate/set_norm actions).
-- ---------------------------------------------------------------------------

set lock_timeout = '10s';
set statement_timeout = '60s';

-- Idempotent re-add in case 20260908140000 hasn't been applied yet — db push
-- applies migrations in filename order regardless, but this migration
-- shouldn't hard-depend on manual SQL-editor run order.
alter table public.procurement_snapshot_items
  add column if not exists reserve_status text generated always as (
    case
      when avg_daily <= 0 then 'no_demand'
      when round(calculation_stock / avg_daily) < norm_days * 0.8 then 'under_norm'
      when round(calculation_stock / avg_daily) > norm_days * 1.2 then 'over_norm'
      else 'on_norm'
    end
  ) stored;

create index if not exists idx_psi_snapshot_reserve_status
  on public.procurement_snapshot_items (snapshot_id, reserve_status);

-- ---------------------------------------------------------------------------
-- procurement_snapshots: archival tracking columns
-- ---------------------------------------------------------------------------

alter table public.procurement_snapshots
  add column if not exists archived_at timestamptz,
  add column if not exists archive_path text;

comment on column public.procurement_snapshots.archived_at is
  'Set once this snapshot''s procurement_snapshot_items rows have been exported and deleted. Null = full detail still in the DB.';
comment on column public.procurement_snapshots.archive_path is
  'Storage path in procurement-snapshot-archives (set before deletion — proof the export succeeded).';

-- ---------------------------------------------------------------------------
-- procurement_snapshot_category_rollup — cheap, permanent per-category trend
-- ---------------------------------------------------------------------------

create table if not exists public.procurement_snapshot_category_rollup (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.procurement_snapshots(id) on delete cascade,
  snapshot_date date not null,
  category_name text not null default '',
  subcategory_name text not null default '',
  item_count integer not null default 0,
  negative_stock_count integer not null default 0,
  orderable_count integer not null default 0,
  no_demand_count integer not null default 0,
  under_norm_count integer not null default 0,
  on_norm_count integer not null default 0,
  over_norm_count integer not null default 0,
  total_stock_purchase_value numeric(16, 2) not null default 0,
  total_stock_selling_value numeric(16, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (snapshot_id, category_name, subcategory_name)
);

comment on table public.procurement_snapshot_category_rollup is
  'Permanent per-category-per-snapshot summary, computed before a snapshot''s raw procurement_snapshot_items are archived+pruned. Survives forever — feeds long-range trend analytics without the 300MB+ raw row cost.';

create index if not exists idx_psr_snapshot_date
  on public.procurement_snapshot_category_rollup (snapshot_date);
create index if not exists idx_psr_category_date
  on public.procurement_snapshot_category_rollup (category_name, subcategory_name, snapshot_date);

alter table public.procurement_snapshot_category_rollup enable row level security;

drop policy if exists procurement_snapshot_category_rollup_select on public.procurement_snapshot_category_rollup;
create policy procurement_snapshot_category_rollup_select
  on public.procurement_snapshot_category_rollup
  for select
  to authenticated
  using (auth_private.current_user_has_permission('procurement.view'));

-- ---------------------------------------------------------------------------
-- compute_procurement_snapshot_rollup — service_role only, idempotent
-- ---------------------------------------------------------------------------

create or replace function public.compute_procurement_snapshot_rollup(p_snapshot_id uuid)
returns integer
language sql
set search_path = ''
as $$
  with ins as (
    insert into public.procurement_snapshot_category_rollup (
      snapshot_id, snapshot_date, category_name, subcategory_name,
      item_count, negative_stock_count, orderable_count,
      no_demand_count, under_norm_count, on_norm_count, over_norm_count,
      total_stock_purchase_value, total_stock_selling_value
    )
    select
      i.snapshot_id,
      coalesce(s.synced_at, s.created_at)::date,
      i.category_name,
      i.subcategory_name,
      count(*)::int,
      count(*) filter (where i.negative_stock)::int,
      count(*) filter (where i.final_order_qty > 0)::int,
      count(*) filter (where i.reserve_status = 'no_demand')::int,
      count(*) filter (where i.reserve_status = 'under_norm')::int,
      count(*) filter (where i.reserve_status = 'on_norm')::int,
      count(*) filter (where i.reserve_status = 'over_norm')::int,
      round(sum(i.raw_stock * i.purchase_price)::numeric, 2),
      round(sum(i.raw_stock * i.selling_price)::numeric, 2)
    from public.procurement_snapshot_items i
    join public.procurement_snapshots s on s.id = i.snapshot_id
    where i.snapshot_id = p_snapshot_id
    group by i.snapshot_id, coalesce(s.synced_at, s.created_at)::date, i.category_name, i.subcategory_name
    on conflict (snapshot_id, category_name, subcategory_name) do nothing
    returning 1
  )
  select count(*)::int from ins;
$$;

revoke all on function public.compute_procurement_snapshot_rollup(uuid) from public;
grant execute on function public.compute_procurement_snapshot_rollup(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- get_procurement_snapshots_eligible_for_archive — the safety-gated picker
-- ---------------------------------------------------------------------------

create or replace function public.get_procurement_snapshots_eligible_for_archive(
  p_cutoff_days integer default 7,
  p_limit integer default 5
)
returns table (id uuid, created_at timestamptz, synced_at timestamptz, item_count integer)
language sql
stable
set search_path = ''
as $$
  with latest_ready as (
    select s.id
    from public.procurement_snapshots s
    where s.status in ('ready', 'generated')
    order by coalesce(s.synced_at, s.created_at) desc
    limit 1
  )
  select s.id, s.created_at, s.synced_at, s.item_count
  from public.procurement_snapshots s
  where s.archived_at is null
    and s.status in ('ready', 'generated')
    and coalesce(s.synced_at, s.created_at) < now() - make_interval(days => greatest(p_cutoff_days, 1))
    and s.id not in (select id from latest_ready)
  order by coalesce(s.synced_at, s.created_at) asc
  limit greatest(p_limit, 1);
$$;

revoke all on function public.get_procurement_snapshots_eligible_for_archive(integer, integer) from public;
grant execute on function public.get_procurement_snapshots_eligible_for_archive(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- prune_procurement_snapshot_items — only after a successful archive upload
-- ---------------------------------------------------------------------------

create or replace function public.prune_procurement_snapshot_items(p_snapshot_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_archive_path text;
  v_deleted integer;
begin
  select archive_path into v_archive_path
  from public.procurement_snapshots
  where id = p_snapshot_id;

  if v_archive_path is null then
    raise exception 'snapshot_not_archived: % has no archive_path — refusing to delete its items', p_snapshot_id;
  end if;

  delete from public.procurement_snapshot_items
  where snapshot_id = p_snapshot_id;
  get diagnostics v_deleted = row_count;

  update public.procurement_snapshots
  set archived_at = coalesce(archived_at, now())
  where id = p_snapshot_id;

  return v_deleted;
end;
$$;

revoke all on function public.prune_procurement_snapshot_items(uuid) from public;
grant execute on function public.prune_procurement_snapshot_items(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Private Storage bucket for the raw-detail archives
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'procurement-snapshot-archives',
  'procurement-snapshot-archives',
  false,
  20971520,
  array['application/gzip', 'text/csv']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists procurement_snapshot_archives_select on storage.objects;
create policy procurement_snapshot_archives_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'procurement-snapshot-archives'
    and auth_private.current_user_has_permission('procurement.view')
  );

-- No insert/update/delete policy for authenticated — only the Edge Function's
-- service_role client writes here (service_role bypasses RLS entirely).

-- ---------------------------------------------------------------------------
-- Daily scheduler — mirrors invoke_procurement_sync_scheduler() 1:1 (same
-- HMAC scheme, same vault secret lookup pattern, same net.http_post shape),
-- just a dedicated secret + a later time slot so the day's fresh sync has
-- already landed before this looks for "snapshots older than 7 days".
--
-- Requires (applied out-of-band, not in this migration):
--   1. vault secret 'procurement_archive_scheduler_hmac_secret' (32+ random
--      bytes, base64url) — generate with:
--        select vault.create_secret(encode(gen_random_bytes(32), 'base64'), 'procurement_archive_scheduler_hmac_secret');
--   2. procurement-archive Edge Function secrets:
--        PROCUREMENT_ARCHIVE_SCHEDULER_ENABLED=true
--        PROCUREMENT_ARCHIVE_SCHEDULER_SECRET_CURRENT=<same value as the vault secret>
-- Until both exist, the cron job fires on schedule but the Edge Function
-- responds 503 scheduler_disabled — safe no-op.
-- ---------------------------------------------------------------------------

create or replace function public.invoke_procurement_archive_scheduler()
returns bigint
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault', 'pg_catalog'
as $function$
declare
  v_ts text;
  v_body constant text := '{}';
  v_body_hash constant text := '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';
  v_secret_b64url text;
  v_secret_bytes bytea;
  v_canonical text;
  v_signature text;
  v_url text;
  v_anon text;
  v_request_id bigint;
  v_b64 text;
begin
  v_ts := floor(extract(epoch from clock_timestamp()))::bigint::text;

  select decrypted_secret into v_secret_b64url
  from vault.decrypted_secrets
  where name = 'procurement_archive_scheduler_hmac_secret'
  limit 1;
  if v_secret_b64url is null then
    raise exception 'scheduler_secret_missing';
  end if;

  v_b64 := translate(v_secret_b64url, '-_', '+/');
  v_b64 := v_b64 || repeat('=', (4 - length(v_b64) % 4) % 4);
  v_secret_bytes := decode(v_b64, 'base64');
  if length(v_secret_bytes) < 32 then
    raise exception 'scheduler_secret_invalid';
  end if;

  v_canonical := v_ts || E'\n' || 'POST' || E'\n' || v_body_hash;
  v_signature := 'v1=' || encode(hmac(v_canonical::bytea, v_secret_bytes, 'sha256'), 'hex');

  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'shugyla_supabase_functions_base_url'
  limit 1;

  select decrypted_secret into v_anon
  from vault.decrypted_secrets
  where name = 'shugyla_supabase_anon_key'
  limit 1;

  if v_url is null or v_anon is null then
    raise exception 'scheduler_cron_config_missing';
  end if;

  select net.http_post(
    url := v_url || '/functions/v1/procurement-archive',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon,
      'Authorization', 'Bearer ' || v_anon,
      'x-shugyla-scheduler-timestamp', v_ts,
      'x-shugyla-scheduler-signature', v_signature
    ),
    body := v_body::jsonb
  ) into v_request_id;

  return v_request_id;
end;
$function$;

select cron.schedule(
  'procurement-archive-scheduler-daily-0730-aqtobe',
  '30 2 * * *',
  $$select public.invoke_procurement_archive_scheduler();$$
);
