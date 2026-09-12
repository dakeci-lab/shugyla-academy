-- ---------------------------------------------------------------------------
-- Owner decision (2026-09-12), same session as 20260912090000: the initial
-- archival run stalled at 294,434 remaining rows. Turned out 94% of what's
-- left (277,987 rows across 31 snapshots) is stuck in 'partially_generated'
-- status, deliberately excluded by the first cut of
-- get_procurement_snapshots_eligible_for_archive as a conservative
-- safety margin — the oldest of those is over a month old (2026-08-11),
-- and the audit before 20260912090000 confirmed no UI path ever lets a
-- user reach a non-latest snapshot's generate/set_norm actions anyway
-- (ProcurementPlannerView always resolves "the latest snapshot").
--
-- Owner confirmed: include 'partially_generated' in the archivable set too,
-- same 7-day-old rule, raw detail still downloadable from «Склад» after
-- archiving. This migration only replaces the eligibility function — the
-- rollup/prune functions and Storage bucket from 20260912090000 are
-- unchanged and already handle any status correctly.
--
-- Safety kept: still never touches the single most recent snapshot
-- (now checked across ready/generated/partially_generated together, not
-- just ready/generated — a partially_generated snapshot newer than the
-- latest ready one must not be picked either), still never touches
-- 'syncing' or 'failed'.
-- ---------------------------------------------------------------------------

set lock_timeout = '10s';
set statement_timeout = '30s';

create or replace function public.get_procurement_snapshots_eligible_for_archive(
  p_cutoff_days integer default 7,
  p_limit integer default 5
)
returns table (id uuid, created_at timestamptz, synced_at timestamptz, item_count integer)
language sql
stable
set search_path = ''
as $$
  with latest_any as (
    select s.id
    from public.procurement_snapshots s
    where s.status in ('ready', 'generated', 'partially_generated')
    order by coalesce(s.synced_at, s.created_at) desc
    limit 1
  )
  select s.id, s.created_at, s.synced_at, s.item_count
  from public.procurement_snapshots s
  where s.archived_at is null
    and s.status in ('ready', 'generated', 'partially_generated')
    and coalesce(s.synced_at, s.created_at) < now() - make_interval(days => greatest(p_cutoff_days, 1))
    and s.id not in (select id from latest_any)
  order by coalesce(s.synced_at, s.created_at) asc
  limit greatest(p_limit, 1);
$$;

revoke all on function public.get_procurement_snapshots_eligible_for_archive(integer, integer) from public;
grant execute on function public.get_procurement_snapshots_eligible_for_archive(integer, integer) to service_role;
