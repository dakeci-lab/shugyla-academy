-- Web Push delivery tracking (additive)

alter table public.notification_deliveries
  add column if not exists request_id uuid null;

alter table public.notification_deliveries
  add column if not exists provider text null;

alter table public.notification_deliveries
  add column if not exists provider_status_code integer null;

alter table public.notification_deliveries
  add column if not exists next_retry_at timestamptz null;

alter table public.notification_deliveries
  add column if not exists updated_at timestamptz not null default now();

update public.notification_deliveries
set updated_at = coalesce(sent_at, failed_at, queued_at, created_at)
where updated_at is null;

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_channel_check;

alter table public.notification_deliveries
  add constraint notification_deliveries_channel_check
  check (channel in ('in_app', 'push', 'web_push'));

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_status_check;

alter table public.notification_deliveries
  add constraint notification_deliveries_status_check
  check (
    status in (
      'queued',
      'processing',
      'pending',
      'sent',
      'accepted',
      'delivered',
      'failed',
      'retryable',
      'permanently_failed',
      'skipped'
    )
  );

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_failed_at_required_check;

alter table public.notification_deliveries
  add constraint notification_deliveries_failed_at_required_check
  check (
    status not in ('failed', 'retryable', 'permanently_failed')
    or failed_at is not null
  );

create unique index if not exists idx_notification_deliveries_request_subscription
  on public.notification_deliveries (request_id, subscription_id)
  where request_id is not null and subscription_id is not null;

create index if not exists idx_notification_deliveries_request_id
  on public.notification_deliveries (request_id)
  where request_id is not null;

drop trigger if exists notification_deliveries_updated_at on public.notification_deliveries;
create trigger notification_deliveries_updated_at
  before update on public.notification_deliveries
  for each row execute function academy_set_updated_at();

create or replace function public.notification_deliveries_require_push_subscription()
returns trigger
language plpgsql
as $$
begin
  if new.channel in ('push', 'web_push') and new.subscription_id is null then
    raise exception 'push delivery requires subscription_id';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
