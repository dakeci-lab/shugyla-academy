-- Этап 2.3: server-side lock for umag-sync — at most one running sync per entity.
-- entity is always 'all' in current usage (the single financial UMAG pipeline);
-- the lock is keyed on entity, not hardcoded to 'all', so it stays correct if a
-- genuinely independent entity value is ever introduced without changing this index.

select pg_advisory_xact_lock(202608191200);

-- ---------------------------------------------------------------------------
-- Pre-cleanup: never let historical/duplicate `running` rows block the new
-- unique index, and never delete history — every row keeps a final status.
--
-- Two cases handled, both closed to 'failed' with a diagnostic message:
--   1. Duplicate `running` rows for the same entity (only the most recent
--      started_at is kept as a plausible in-flight run).
--   2. Any `running` row (including the one kept above) older than the
--      stale threshold used by umag-sync's own runtime cleanup
--      (STALE_SYNC_THRESHOLD_MINUTES = 15 in supabase/functions/_shared/
--      umagConfig.ts — keep these two in sync if that constant changes).
-- ---------------------------------------------------------------------------

with ranked_running as (
  select
    id,
    entity,
    started_at,
    row_number() over (partition by entity order by started_at desc) as rn
  from public.umag_sync_runs
  where status = 'running'
)
update public.umag_sync_runs r
set
  status = 'failed',
  finished_at = coalesce(r.finished_at, now()),
  error_message = coalesce(
    r.error_message,
    'stale: closed by migration 20260819120000_umag_sync_runs_lock — either a duplicate running row for its entity, or older than the 15-minute stale-run threshold.'
  )
from ranked_running
where r.id = ranked_running.id
  and (
    ranked_running.rn > 1
    or r.started_at < now() - interval '15 minutes'
  );

-- ---------------------------------------------------------------------------
-- The lock itself: a partial unique index makes a second concurrent
-- `insert ... status='running'` for the same entity fail with a 23505 unique
-- violation. umag-sync distinguishes this specific violation (by index name)
-- from any other insert failure and reports SYNC_ALREADY_RUNNING instead of
-- a generic error. Releasing the lock needs no extra code: the moment a row
-- transitions running -> success/partial/failed, the partial index no longer
-- indexes it and the next insert for that entity succeeds.
-- ---------------------------------------------------------------------------

create unique index if not exists umag_sync_runs_entity_running_lock
  on public.umag_sync_runs (entity)
  where status = 'running';

comment on index public.umag_sync_runs_entity_running_lock is
  'Этап 2.3 server-side sync lock: at most one running umag-sync per entity. '
  'A second concurrent insert into a taken lock fails with 23505 — umag-sync '
  'reports that as SYNC_ALREADY_RUNNING, never as a generic error.';
