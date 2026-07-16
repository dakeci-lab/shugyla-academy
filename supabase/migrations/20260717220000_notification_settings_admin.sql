-- Admin notification settings: permission + idempotent time-tracker rule seeds

insert into public.permissions (code, name, module, sort_order)
values ('notifications.manage', 'Управление уведомлениями', 'settings', 162)
on conflict (code) do update
set
  name = excluded.name,
  module = excluded.module,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'admin'
  and p.code = 'notifications.manage'
on conflict (role_id, permission_id) do nothing;

-- Ensure time-tracker templates exist (no-op if already seeded)
insert into public.notification_templates (
  code,
  module_code,
  event_code,
  title_template,
  body_template,
  default_action_url,
  default_priority
)
values
  (
    'time_tracker.shift_start_soon',
    'time_tracker',
    'shift_start_soon',
    'Смена скоро начнётся',
    'Ваша смена начинается через {{minutes}} минут. Не забудьте отметиться по прибытии.',
    '/platform',
    'normal'
  ),
  (
    'time_tracker.clock_in_missing',
    'time_tracker',
    'clock_in_missing',
    'Не забудьте отметиться',
    'Ваша смена уже началась. Нажмите «Я на работе», чтобы зафиксировать приход.',
    '/platform',
    'high'
  ),
  (
    'time_tracker.shift_end_reached',
    'time_tracker',
    'shift_end_reached',
    'Завершите смену',
    'Ваша смена завершилась. Не забудьте нажать «Я ухожу».',
    '/platform',
    'normal'
  ),
  (
    'time_tracker.clock_out_missing',
    'time_tracker',
    'clock_out_missing',
    'Отметка ухода не зафиксирована',
    'Вы ещё не завершили смену в тайм-трекере. Зафиксируйте уход.',
    '/platform',
    'high'
  )
on conflict (code) do nothing;

insert into public.notification_rules (
  code,
  template_id,
  module_code,
  event_code,
  is_enabled,
  trigger_type,
  recipient_type,
  offset_minutes,
  repeat_after_minutes,
  max_attempts,
  channels,
  priority
)
select
  v.code,
  t.id,
  v.module_code,
  v.event_code,
  false,
  'scheduled',
  'employee',
  v.offset_minutes,
  v.repeat_after_minutes,
  v.max_attempts,
  v.channels,
  t.default_priority
from (
  values
    (
      'time_tracker.rule.shift_start_soon'::text,
      'time_tracker'::text,
      'shift_start_soon'::text,
      -10::integer,
      null::integer,
      1::integer,
      array['in_app', 'push']::text[]
    ),
    (
      'time_tracker.rule.clock_in_missing',
      'time_tracker',
      'clock_in_missing',
      5,
      10,
      2,
      array['in_app', 'push']::text[]
    ),
    (
      'time_tracker.rule.shift_end_reached',
      'time_tracker',
      'shift_end_reached',
      0,
      null,
      1,
      array['in_app', 'push']::text[]
    ),
    (
      'time_tracker.rule.clock_out_missing',
      'time_tracker',
      'clock_out_missing',
      10,
      10,
      2,
      array['in_app', 'push']::text[]
    )
) as v(
  code,
  module_code,
  event_code,
  offset_minutes,
  repeat_after_minutes,
  max_attempts,
  channels
)
inner join public.notification_templates t
  on t.code = v.module_code || '.' || v.event_code
on conflict (code) do nothing;
