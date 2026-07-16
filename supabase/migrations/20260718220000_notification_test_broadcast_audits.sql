-- Audit log and cooldown anchor for admin mass test push broadcasts.

create table if not exists public.notification_test_broadcast_audits (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  initiated_by_employee_id bigint not null references public.academy_users (id) on delete restrict,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  active_employee_count integer not null default 0,
  employees_with_subscriptions_count integer not null default 0,
  subscription_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  invalidated_count integer not null default 0,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_test_broadcast_audits_initiated_by_started
  on public.notification_test_broadcast_audits (initiated_by_employee_id, started_at desc);

create index if not exists idx_notification_test_broadcast_audits_started_at
  on public.notification_test_broadcast_audits (started_at desc);

alter table public.notification_test_broadcast_audits enable row level security;

revoke all on table public.notification_test_broadcast_audits from public;
revoke all on table public.notification_test_broadcast_audits from anon;
revoke all on table public.notification_test_broadcast_audits from authenticated;
grant all on table public.notification_test_broadcast_audits to service_role;
