-- Stage 6: admin escalations for time-tracker violations

create table if not exists public.time_tracker_escalation_settings (
  id integer primary key default 1 check (id = 1),
  is_enabled boolean not null default true,
  clock_in_delay_minutes integer not null default 15
    check (clock_in_delay_minutes >= 0 and clock_in_delay_minutes <= 1440),
  clock_out_delay_minutes integer not null default 20
    check (clock_out_delay_minutes >= 0 and clock_out_delay_minutes <= 1440),
  recipient_mode text not null default 'duty_with_fallback'
    check (recipient_mode in ('duty', 'duty_with_fallback')),
  fallback_employee_ids integer[] not null default '{}',
  push_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.time_tracker_escalation_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.time_tracker_violations (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.academy_employee_shifts (id) on delete cascade,
  employee_id integer not null references public.academy_users (id),
  violation_type text not null check (violation_type in ('clock_in', 'clock_out')),
  shift_date date not null,
  planned_at timestamptz not null,
  actual_at timestamptz null,
  delay_minutes integer not null default 0,
  status text not null default 'active'
    check (status in ('active', 'resolved', 'skipped')),
  notified_admin_ids integer[] not null default '{}',
  web_push_outcome text null,
  employee_push_note text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  unique (shift_id, violation_type)
);

create index if not exists time_tracker_violations_status_created_idx
  on public.time_tracker_violations (status, created_at desc);

create index if not exists time_tracker_violations_employee_idx
  on public.time_tracker_violations (employee_id, shift_date desc);

alter table public.time_tracker_escalation_settings enable row level security;
alter table public.time_tracker_violations enable row level security;

revoke all on table public.time_tracker_escalation_settings from anon, authenticated;
revoke all on table public.time_tracker_violations from anon, authenticated;
grant all privileges on table public.time_tracker_escalation_settings to service_role;
grant all privileges on table public.time_tracker_violations to service_role;

insert into public.notification_templates (
  code, module_code, event_code, title_template, body_template, default_action_url, default_priority
)
values
  (
    'time_tracker.admin_clock_in_escalation',
    'time_tracker',
    'admin_clock_in_escalation',
    'Сотрудник не начал смену',
    '{{employee_name}} должен был начать смену в {{planned_start_time}}, но до сих пор не отметился. Опоздание: {{delay_minutes}} мин.',
    '/platform',
    'high'
  ),
  (
    'time_tracker.admin_clock_out_escalation',
    'time_tracker',
    'admin_clock_out_escalation',
    'Сотрудник не завершил смену',
    '{{employee_name}} должен был завершить смену в {{planned_end_time}}, но тайм-трекер всё ещё открыт. Задержка: {{delay_minutes}} мин.',
    '/platform',
    'high'
  )
on conflict (code) do update
set
  title_template = excluded.title_template,
  body_template = excluded.body_template,
  default_action_url = excluded.default_action_url,
  default_priority = excluded.default_priority;

insert into public.notification_rules (
  code, template_id, module_code, event_code, is_enabled, trigger_type,
  recipient_type, offset_minutes, repeat_after_minutes, max_attempts,
  channels, priority
)
select
  'time_tracker.rule.admin_clock_in_escalation',
  t.id,
  'time_tracker',
  'admin_clock_in_escalation',
  true,
  'scheduled',
  'admin',
  15,
  null,
  1,
  array['in_app', 'push']::text[],
  'high'
from public.notification_templates t
where t.code = 'time_tracker.admin_clock_in_escalation'
on conflict (code) do update
set
  is_enabled = excluded.is_enabled,
  offset_minutes = excluded.offset_minutes,
  recipient_type = excluded.recipient_type,
  max_attempts = excluded.max_attempts;

insert into public.notification_rules (
  code, template_id, module_code, event_code, is_enabled, trigger_type,
  recipient_type, offset_minutes, repeat_after_minutes, max_attempts,
  channels, priority
)
select
  'time_tracker.rule.admin_clock_out_escalation',
  t.id,
  'time_tracker',
  'admin_clock_out_escalation',
  true,
  'scheduled',
  'admin',
  20,
  null,
  1,
  array['in_app', 'push']::text[],
  'high'
from public.notification_templates t
where t.code = 'time_tracker.admin_clock_out_escalation'
on conflict (code) do update
set
  is_enabled = excluded.is_enabled,
  offset_minutes = excluded.offset_minutes,
  recipient_type = excluded.recipient_type,
  max_attempts = excluded.max_attempts;
