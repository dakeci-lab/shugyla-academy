-- Web Push subscription foundation (additive columns + device ownership)

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

notify pgrst, 'reload schema';
