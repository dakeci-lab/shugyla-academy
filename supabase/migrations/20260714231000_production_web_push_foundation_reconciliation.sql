-- Production Web Push foundation reconciliation
-- Applies 20260714140000 + 20260714150000 without re-running Auth migrations.
-- Requires notification foundation tables.

select pg_advisory_xact_lock(202607142310);

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'notification_push_subscriptions'
  ) then
    raise exception 'precondition failed: notification_push_subscriptions missing';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'notification_deliveries'
  ) then
    raise exception 'precondition failed: notification_deliveries missing';
  end if;
end;
$$;

-- === 20260714140000_web_push_subscription_foundation ===

alter table public.notification_push_subscriptions
  add column if not exists device_id uuid;

update public.notification_push_subscriptions
set device_id = gen_random_uuid()
where device_id is null;

alter table public.notification_push_subscriptions
  alter column device_id set not null;

alter table public.notification_push_subscriptions
  add column if not exists expiration_time timestamptz null;

alter table public.notification_push_subscriptions
  add column if not exists revoked_at timestamptz null;

alter table public.notification_push_subscriptions
  add column if not exists browser text null;

alter table public.notification_push_subscriptions
  drop constraint if exists notification_push_subscriptions_permission_status_check;

alter table public.notification_push_subscriptions
  add constraint notification_push_subscriptions_permission_status_check
  check (permission_status in ('granted', 'denied', 'default', 'revoked'));

create unique index if not exists idx_notification_push_subscriptions_employee_device
  on public.notification_push_subscriptions (employee_id, device_id);

create index if not exists idx_notification_push_subscriptions_device_id
  on public.notification_push_subscriptions (device_id);

create index if not exists idx_notification_push_subscriptions_active_employee
  on public.notification_push_subscriptions (employee_id, is_active)
  where is_active = true;

-- === 20260714150000_web_push_delivery_tracking ===

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
