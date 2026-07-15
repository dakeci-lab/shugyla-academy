-- Production notification foundation reconciliation
-- Applies notification-only objects from 20260713194500 WITHOUT auth_user_id DDL/backfill.
-- Requires Phase 1 + Phase 2 already applied in production.
-- Idempotent. Safe for fresh local DB after canonical notification migration.

select pg_advisory_xact_lock(202607142300);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'academy_users' and column_name = 'auth_user_id'
  ) then
    raise exception 'precondition failed: academy_users.auth_user_id missing (apply Phase 1 first)';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'academy_users'
      and policyname = 'Allow anon read write academy_users'
  ) then
    raise exception 'precondition failed: legacy anon policy still present (apply Phase 2 first)';
  end if;
end;
$$;

-- 2. notification_templates
-- ---------------------------------------------------------------------------

create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  module_code text not null,
  event_code text not null,
  title_template text not null,
  body_template text not null,
  default_action_url text null,
  default_priority text not null default 'normal',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_templates_default_priority_check
    check (default_priority in ('low', 'normal', 'high', 'urgent')),
  constraint notification_templates_default_action_url_check
    check (
      default_action_url is null
      or (
        default_action_url like '/%'
        and default_action_url not like '//%'
      )
    )
);

create index if not exists idx_notification_templates_module_event
  on public.notification_templates (module_code, event_code);

drop trigger if exists notification_templates_updated_at on public.notification_templates;
create trigger notification_templates_updated_at
  before update on public.notification_templates
  for each row execute function academy_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. notification_rules
-- ---------------------------------------------------------------------------

create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  template_id uuid not null references public.notification_templates (id) on delete restrict,
  module_code text not null,
  event_code text not null,
  is_enabled boolean not null default true,
  trigger_type text not null,
  recipient_type text not null default 'employee',
  recipient_role_id uuid null references public.roles (id) on delete set null,
  offset_minutes integer not null default 0,
  repeat_after_minutes integer null,
  max_attempts integer not null default 1,
  channels text[] not null default array['in_app', 'push']::text[],
  priority text not null default 'normal',
  conditions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_rules_trigger_type_check
    check (trigger_type in ('scheduled', 'event', 'manual')),
  constraint notification_rules_recipient_type_check
    check (recipient_type in ('employee', 'role', 'admin', 'multiple', 'all')),
  constraint notification_rules_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint notification_rules_max_attempts_check
    check (max_attempts >= 1),
  constraint notification_rules_repeat_after_minutes_check
    check (repeat_after_minutes is null or repeat_after_minutes > 0),
  constraint notification_rules_channels_not_empty_check
    check (cardinality(channels) > 0),
  constraint notification_rules_channels_allowed_check
    check (channels <@ array['in_app', 'push']::text[])
);

create index if not exists idx_notification_rules_module_event
  on public.notification_rules (module_code, event_code);

create index if not exists idx_notification_rules_template_id
  on public.notification_rules (template_id);

drop trigger if exists notification_rules_updated_at on public.notification_rules;
create trigger notification_rules_updated_at
  before update on public.notification_rules
  for each row execute function academy_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. notifications
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references public.academy_users (id) on delete cascade,
  auth_user_id uuid null references auth.users (id) on delete set null,
  template_id uuid null references public.notification_templates (id) on delete set null,
  rule_id uuid null references public.notification_rules (id) on delete set null,
  module_code text not null,
  event_code text not null,
  title text not null,
  body text not null,
  action_url text null,
  priority text not null default 'normal',
  status text not null default 'pending',
  scheduled_for timestamptz null,
  expires_at timestamptz null,
  read_at timestamptz null,
  cancelled_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  deduplication_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notifications_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint notifications_status_check
    check (status in ('pending', 'scheduled', 'processing', 'dispatched', 'cancelled', 'failed')),
  constraint notifications_action_url_check
    check (
      action_url is null
      or (
        action_url like '/%'
        and action_url not like '//%'
      )
    ),
  constraint notifications_expires_at_check
    check (expires_at is null or expires_at > created_at),
  constraint notifications_read_at_check
    check (read_at is null or read_at >= created_at)
);

create index if not exists idx_notifications_employee_created_at
  on public.notifications (employee_id, created_at desc);

create index if not exists idx_notifications_auth_user_created_at
  on public.notifications (auth_user_id, created_at desc)
  where auth_user_id is not null;

create index if not exists idx_notifications_status_scheduled_for
  on public.notifications (status, scheduled_for);

create index if not exists idx_notifications_module_event
  on public.notifications (module_code, event_code);

create index if not exists idx_notifications_read_at
  on public.notifications (read_at)
  where read_at is not null;

drop trigger if exists notifications_updated_at on public.notifications;
create trigger notifications_updated_at
  before update on public.notifications
  for each row execute function academy_set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. notification_push_subscriptions
-- ---------------------------------------------------------------------------

create table if not exists public.notification_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references public.academy_users (id) on delete cascade,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  device_name text null,
  user_agent text null,
  platform text null,
  permission_status text not null default 'granted',
  is_active boolean not null default true,
  last_used_at timestamptz null,
  last_success_at timestamptz null,
  last_failure_at timestamptz null,
  failure_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_push_subscriptions_permission_status_check
    check (permission_status in ('granted', 'denied', 'revoked')),
  constraint notification_push_subscriptions_failure_count_check
    check (failure_count >= 0),
  constraint notification_push_subscriptions_endpoint_not_empty_check
    check (length(trim(endpoint)) > 0),
  constraint notification_push_subscriptions_p256dh_key_not_empty_check
    check (length(trim(p256dh_key)) > 0),
  constraint notification_push_subscriptions_auth_key_not_empty_check
    check (length(trim(auth_key)) > 0)
);

create index if not exists idx_notification_push_subscriptions_employee_id
  on public.notification_push_subscriptions (employee_id);

create index if not exists idx_notification_push_subscriptions_auth_user_id
  on public.notification_push_subscriptions (auth_user_id);

create index if not exists idx_notification_push_subscriptions_is_active
  on public.notification_push_subscriptions (is_active);

create index if not exists idx_notification_push_subscriptions_auth_user_active
  on public.notification_push_subscriptions (auth_user_id, is_active);

drop trigger if exists notification_push_subscriptions_updated_at on public.notification_push_subscriptions;
create trigger notification_push_subscriptions_updated_at
  before update on public.notification_push_subscriptions
  for each row execute function academy_set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. notification_deliveries
-- ---------------------------------------------------------------------------

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  subscription_id uuid null references public.notification_push_subscriptions (id) on delete set null,
  channel text not null,
  status text not null default 'queued',
  attempt_number integer not null default 1,
  provider_message_id text null,
  provider_response jsonb null,
  error_code text null,
  error_message text null,
  queued_at timestamptz not null default now(),
  sent_at timestamptz null,
  delivered_at timestamptz null,
  failed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint notification_deliveries_channel_check
    check (channel in ('in_app', 'push')),
  constraint notification_deliveries_status_check
    check (status in ('queued', 'processing', 'sent', 'delivered', 'failed', 'skipped')),
  constraint notification_deliveries_attempt_number_check
    check (attempt_number >= 1),
  constraint notification_deliveries_failed_at_required_check
    check (status <> 'failed' or failed_at is not null)
);

-- Push deliveries require subscription_id at INSERT time only.
-- subscription_id may become NULL after device unsubscribe (ON DELETE SET NULL on FK).
create or replace function public.notification_deliveries_require_push_subscription()
returns trigger
language plpgsql
as $$
begin
  if new.channel = 'push' and new.subscription_id is null then
    raise exception 'push delivery requires subscription_id';
  end if;
  return new;
end;
$$;

drop trigger if exists notification_deliveries_push_subscription_insert on public.notification_deliveries;
create trigger notification_deliveries_push_subscription_insert
  before insert on public.notification_deliveries
  for each row execute function public.notification_deliveries_require_push_subscription();

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_push_subscription_required_check;

create index if not exists idx_notification_deliveries_notification_id
  on public.notification_deliveries (notification_id);

create index if not exists idx_notification_deliveries_subscription_id
  on public.notification_deliveries (subscription_id)
  where subscription_id is not null;

create index if not exists idx_notification_deliveries_status
  on public.notification_deliveries (status);

create index if not exists idx_notification_deliveries_status_queued_at
  on public.notification_deliveries (status, queued_at);

-- ---------------------------------------------------------------------------
-- 7. notification_preferences
-- ---------------------------------------------------------------------------

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references public.academy_users (id) on delete cascade,
  auth_user_id uuid null references auth.users (id) on delete set null,
  module_code text not null default '*',
  in_app_enabled boolean not null default true,
  push_enabled boolean not null default true,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time null,
  quiet_hours_end time null,
  timezone text not null default 'Asia/Almaty',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_preferences_employee_module_unique
    unique (employee_id, module_code),
  constraint notification_preferences_quiet_hours_check
    check (
      not quiet_hours_enabled
      or (quiet_hours_start is not null and quiet_hours_end is not null)
    )
);

create index if not exists idx_notification_preferences_employee_id
  on public.notification_preferences (employee_id);

create index if not exists idx_notification_preferences_auth_user_id
  on public.notification_preferences (auth_user_id)
  where auth_user_id is not null;

drop trigger if exists notification_preferences_updated_at on public.notification_preferences;
create trigger notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function academy_set_updated_at();

-- ---------------------------------------------------------------------------
-- 7b. Private schema + RLS ownership helper (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
-- authenticated must not receive SELECT on public.academy_users (broad exposure).
-- RLS policies on push subscriptions / preferences need to verify employee ownership
-- without a direct subquery to academy_users under invoker privileges.

create schema if not exists notification_private;

revoke all on schema notification_private from public;
revoke all on schema notification_private from anon;
revoke all on schema notification_private from authenticated;

create or replace function notification_private.employee_owned_by_current_auth(
  p_employee_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_employee_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.academy_users as au
      where au.id = p_employee_id
        and au.auth_user_id = auth.uid()
    );
$$;

comment on function notification_private.employee_owned_by_current_auth(bigint) is
  'Checks whether employee_id belongs to the current Supabase Auth user. For RLS on notification tables only.';

revoke all on function notification_private.employee_owned_by_current_auth(bigint) from public;
revoke all on function notification_private.employee_owned_by_current_auth(bigint) from anon;
revoke all on function notification_private.employee_owned_by_current_auth(bigint) from authenticated;

grant usage on schema notification_private to authenticated;
grant usage on schema notification_private to service_role;

grant execute on function notification_private.employee_owned_by_current_auth(bigint) to authenticated;
grant execute on function notification_private.employee_owned_by_current_auth(bigint) to service_role;

-- Private mark-read: SECURITY DEFINER UPDATE under definer privileges (authenticated has SELECT only).
create or replace function notification_private.mark_notification_read_internal(
  p_notification_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_read_at timestamptz;
begin
  if p_notification_id is null then
    return false;
  end if;

  if auth.uid() is null then
    return false;
  end if;

  select n.read_at
  into v_read_at
  from public.notifications as n
  where n.id = p_notification_id
    and n.auth_user_id = auth.uid();

  if not found then
    return false;
  end if;

  if v_read_at is not null then
    return true;
  end if;

  update public.notifications as n
  set read_at = now()
  where n.id = p_notification_id
    and n.auth_user_id = auth.uid()
    and n.read_at is null;

  return true;
end;
$$;

comment on function notification_private.mark_notification_read_internal(uuid) is
  'Private idempotent mark-own-notification-read. Used only by public SECURITY INVOKER RPC wrapper.';

revoke all on function notification_private.mark_notification_read_internal(uuid) from public;
revoke all on function notification_private.mark_notification_read_internal(uuid) from anon;
revoke all on function notification_private.mark_notification_read_internal(uuid) from authenticated;

grant execute on function notification_private.mark_notification_read_internal(uuid) to authenticated;
grant execute on function notification_private.mark_notification_read_internal(uuid) to service_role;

-- Public RPC wrapper: SECURITY INVOKER delegates to private definer function (no table UPDATE grant needed).
create or replace function public.mark_notification_read(
  p_notification_id uuid
)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select notification_private.mark_notification_read_internal(p_notification_id);
$$;

comment on function public.mark_notification_read(uuid) is
  'Public RPC wrapper to safely mark the caller''s own notification as read.';

revoke all on function public.mark_notification_read(uuid) from public;
revoke all on function public.mark_notification_read(uuid) from anon;
revoke all on function public.mark_notification_read(uuid) from authenticated;

grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_notification_read(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.notification_templates enable row level security;
alter table public.notification_rules enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_push_subscriptions enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_preferences enable row level security;

-- notification_templates / notification_rules: no user-facing policies (admin/backend only)

-- notifications: read own rows only; no direct insert/update/delete from frontend
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications
  for select
  to authenticated
  using (auth_user_id = auth.uid());

-- notification_push_subscriptions
drop policy if exists notification_push_subscriptions_select_own on public.notification_push_subscriptions;
create policy notification_push_subscriptions_select_own
  on public.notification_push_subscriptions
  for select
  to authenticated
  using (
    auth.uid() is not null
    and auth_user_id = auth.uid()
    and notification_private.employee_owned_by_current_auth(employee_id)
  );

drop policy if exists notification_push_subscriptions_insert_own on public.notification_push_subscriptions;
create policy notification_push_subscriptions_insert_own
  on public.notification_push_subscriptions
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and auth_user_id = auth.uid()
    and notification_private.employee_owned_by_current_auth(employee_id)
  );

drop policy if exists notification_push_subscriptions_update_own on public.notification_push_subscriptions;
create policy notification_push_subscriptions_update_own
  on public.notification_push_subscriptions
  for update
  to authenticated
  using (
    auth.uid() is not null
    and auth_user_id = auth.uid()
    and notification_private.employee_owned_by_current_auth(employee_id)
  )
  with check (
    auth.uid() is not null
    and auth_user_id = auth.uid()
    and notification_private.employee_owned_by_current_auth(employee_id)
  );

drop policy if exists notification_push_subscriptions_delete_own on public.notification_push_subscriptions;
create policy notification_push_subscriptions_delete_own
  on public.notification_push_subscriptions
  for delete
  to authenticated
  using (
    auth.uid() is not null
    and auth_user_id = auth.uid()
    and notification_private.employee_owned_by_current_auth(employee_id)
  );

-- notification_preferences
drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own
  on public.notification_preferences
  for select
  to authenticated
  using (
    auth.uid() is not null
    and auth_user_id = auth.uid()
    and notification_private.employee_owned_by_current_auth(employee_id)
  );

drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own
  on public.notification_preferences
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and auth_user_id = auth.uid()
    and notification_private.employee_owned_by_current_auth(employee_id)
  );

drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own
  on public.notification_preferences
  for update
  to authenticated
  using (
    auth.uid() is not null
    and auth_user_id = auth.uid()
    and notification_private.employee_owned_by_current_auth(employee_id)
  )
  with check (
    auth.uid() is not null
    and auth_user_id = auth.uid()
    and notification_private.employee_owned_by_current_auth(employee_id)
  );

-- notification_deliveries: no policies for authenticated/anon (server-side only)

-- ---------------------------------------------------------------------------
-- 8b. Table privileges (SQL grants; RLS filters rows)
-- ---------------------------------------------------------------------------
-- RLS policies control which rows are visible; roles still need table-level
-- SQL privileges before PostgreSQL evaluates those policies.

-- Anon: no direct access to notification tables
revoke all on table public.notification_templates from anon;
revoke all on table public.notification_rules from anon;
revoke all on table public.notifications from anon;
revoke all on table public.notification_push_subscriptions from anon;
revoke all on table public.notification_deliveries from anon;
revoke all on table public.notification_preferences from anon;

-- Authenticated: reset inherited defaults, then grant only what RLS allows
revoke all on table public.notification_templates from authenticated;
revoke all on table public.notification_rules from authenticated;
revoke all on table public.notifications from authenticated;
revoke all on table public.notification_push_subscriptions from authenticated;
revoke all on table public.notification_deliveries from authenticated;
revoke all on table public.notification_preferences from authenticated;

grant select on table public.notifications to authenticated;

grant select, insert, update, delete
  on table public.notification_push_subscriptions
  to authenticated;

grant select, insert, update
  on table public.notification_preferences
  to authenticated;

-- Service role: server-side dispatcher / admin API (bypasses RLS, needs table access)
grant all privileges on table public.notification_templates to service_role;
grant all privileges on table public.notification_rules to service_role;
grant all privileges on table public.notifications to service_role;
grant all privileges on table public.notification_push_subscriptions to service_role;
grant all privileges on table public.notification_deliveries to service_role;
grant all privileges on table public.notification_preferences to service_role;

-- ---------------------------------------------------------------------------
-- 9. Seed templates and rules (disabled until dispatcher exists)
-- ---------------------------------------------------------------------------

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
    '/platform/time-tracker',
    'normal'
  ),
  (
    'time_tracker.clock_in_missing',
    'time_tracker',
    'clock_in_missing',
    'Не забудьте отметиться',
    'Ваша смена уже началась. Нажмите «Я на работе», чтобы зафиксировать приход.',
    '/platform/time-tracker',
    'high'
  ),
  (
    'time_tracker.shift_end_reached',
    'time_tracker',
    'shift_end_reached',
    'Завершите смену',
    'Ваша смена завершилась. Не забудьте нажать «Я ухожу».',
    '/platform/time-tracker',
    'normal'
  ),
  (
    'time_tracker.clock_out_missing',
    'time_tracker',
    'clock_out_missing',
    'Отметка ухода не зафиксирована',
    'Вы ещё не завершили смену в тайм-трекере. Зафиксируйте уход.',
    '/platform/time-tracker',
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

-- ---------------------------------------------------------------------------
-- 10. Post-apply verification queries (run manually after migration apply)
-- ---------------------------------------------------------------------------
--
-- -- auth_user_id backfill summary
-- select
--   count(*) filter (where auth_user_id is not null) as with_auth_user_id,
--   count(*) filter (where auth_user_id is null) as without_auth_user_id,
--   count(*) as total
-- from public.academy_users;
--
-- -- duplicate auth_user_id among employees (must be 0 rows)
-- select auth_user_id, count(*) as employee_count
-- from public.academy_users
-- where auth_user_id is not null
-- group by auth_user_id
-- having count(*) > 1;
--
-- -- orphan auth_user_id without auth.users (must be 0 rows)
-- select au.id, au.login, au.auth_user_id
-- from public.academy_users au
-- left join auth.users u on u.id = au.auth_user_id
-- where au.auth_user_id is not null
--   and u.id is null;
--
-- -- employees still unlinked but with computable technical email and existing auth user
-- with candidates as (
--   select
--     au.id,
--     au.login,
--     notification_login_to_technical_email(au.login) as technical_email
--   from public.academy_users au
--   where au.auth_user_id is null
-- )
-- select c.*
-- from candidates c
-- where exists (
--   select 1 from auth.users u where lower(u.email) = c.technical_email
-- );
--
-- -- seed templates and disabled rules
-- select code, is_active from public.notification_templates order by code;
-- select code, is_enabled, offset_minutes, repeat_after_minutes, max_attempts
-- from public.notification_rules
-- order by code;

notify pgrst, 'reload schema';
