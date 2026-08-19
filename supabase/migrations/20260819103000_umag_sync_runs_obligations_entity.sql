-- Allow journaling targeted open-obligation syncs in umag_sync_runs.
-- Prerequisite for the umag-sync `sync_open_obligations` action: without this
-- value the run insert fails and the sync is not journaled at all.
-- Does not touch data, grants, RLS, or other tables.

select pg_advisory_xact_lock(202608191030);

alter table public.umag_sync_runs
  drop constraint if exists umag_sync_runs_entity_check;

alter table public.umag_sync_runs
  add constraint umag_sync_runs_entity_check check (
    entity in ('suppliers', 'supplies', 'all', 'obligations')
  );

comment on column public.umag_sync_runs.entity is
  'Sync scope: suppliers | supplies | all | obligations (open payment obligations across months).';
