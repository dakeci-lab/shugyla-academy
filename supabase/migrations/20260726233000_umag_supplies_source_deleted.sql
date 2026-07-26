-- Soft-delete / snapshot reconciliation for UMAG supplies mirror

select pg_advisory_xact_lock(202607262330);

alter table public.umag_supplies
  add column if not exists is_source_deleted boolean not null default false,
  add column if not exists source_deleted_at timestamptz null,
  add column if not exists last_seen_at timestamptz null;

comment on column public.umag_supplies.is_source_deleted is
  'True when supply was previously imported but missing from a fully successful UMAG period snapshot.';
comment on column public.umag_supplies.source_deleted_at is
  'When the row was marked missing from UMAG source snapshot.';
comment on column public.umag_supplies.last_seen_at is
  'Last time this supply id was present in a UMAG supplies/all snapshot.';

-- Backfill: existing rows were seen at last sync
update public.umag_supplies
set last_seen_at = coalesce(last_seen_at, last_synced_at, updated_at, created_at)
where last_seen_at is null;

create index if not exists idx_umag_supplies_active_doc_time
  on public.umag_supplies (doc_time)
  where is_source_deleted = false;

create index if not exists idx_umag_supplies_is_source_deleted
  on public.umag_supplies (is_source_deleted);

alter table public.umag_sync_runs
  add column if not exists records_source_deleted integer not null default 0,
  add column if not exists records_reactivated integer not null default 0;

comment on column public.umag_sync_runs.records_source_deleted is
  'Active DB supplies in period marked is_source_deleted after successful full snapshot reconciliation.';
comment on column public.umag_sync_runs.records_reactivated is
  'Previously source-deleted supplies restored because they reappeared in UMAG.';
