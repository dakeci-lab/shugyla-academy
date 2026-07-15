-- One-time DB-backed permits for controlled production Web Push test-send.

create table if not exists public.notification_test_send_permits (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references public.academy_users (id) on delete cascade,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  consumed_request_id uuid null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint notification_test_send_permits_expires_after_issue
    check (expires_at > issued_at),
  constraint notification_test_send_permits_max_ttl
    check (expires_at <= issued_at + interval '5 minutes'),
  constraint notification_test_send_permits_consumed_request_requires_consumed_at
    check (consumed_request_id is null or consumed_at is not null),
  constraint notification_test_send_permits_not_revoked_and_consumed
    check (not (consumed_at is not null and revoked_at is not null))
);

create index if not exists idx_notification_test_send_permits_employee_device
  on public.notification_test_send_permits (employee_id, device_id);

create index if not exists idx_notification_test_send_permits_expires_at
  on public.notification_test_send_permits (expires_at);

create index if not exists idx_notification_test_send_permits_consumed_at
  on public.notification_test_send_permits (consumed_at);

create index if not exists idx_notification_test_send_permits_revoked_at
  on public.notification_test_send_permits (revoked_at);

create unique index if not exists idx_notification_test_send_permits_one_active
  on public.notification_test_send_permits (employee_id, device_id)
  where consumed_at is null and revoked_at is null;

alter table public.notification_test_send_permits enable row level security;

revoke all on table public.notification_test_send_permits from public;
revoke all on table public.notification_test_send_permits from anon;
revoke all on table public.notification_test_send_permits from authenticated;
grant all on table public.notification_test_send_permits to service_role;

create or replace function public.issue_notification_test_send_permit(
  p_employee_id bigint,
  p_auth_user_id uuid,
  p_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_expires_at timestamptz := v_now + interval '5 minutes';
  v_permit_id uuid;
begin
  update public.notification_test_send_permits
  set revoked_at = v_now
  where employee_id = p_employee_id
    and device_id = p_device_id
    and consumed_at is null
    and revoked_at is null;

  insert into public.notification_test_send_permits (
    employee_id,
    auth_user_id,
    device_id,
    issued_at,
    expires_at
  ) values (
    p_employee_id,
    p_auth_user_id,
    p_device_id,
    v_now,
    v_expires_at
  )
  returning id into v_permit_id;

  return jsonb_build_object(
    'id', v_permit_id,
    'expires_at', v_expires_at
  );
end;
$$;

create or replace function public.consume_notification_test_send_permit(
  p_permit_id uuid,
  p_employee_id bigint,
  p_auth_user_id uuid,
  p_device_id uuid,
  p_request_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.notification_test_send_permits%rowtype;
begin
  select *
  into v_row
  from public.notification_test_send_permits
  where id = p_permit_id
  for update;

  if not found then
    return 'permit_not_found';
  end if;

  if v_row.employee_id <> p_employee_id
     or v_row.auth_user_id <> p_auth_user_id
     or v_row.device_id <> p_device_id then
    return 'permit_invalid';
  end if;

  if v_row.revoked_at is not null then
    return 'permit_revoked';
  end if;

  if v_row.consumed_at is not null then
    if v_row.consumed_request_id = p_request_id then
      return 'permit_already_used_same_request';
    end if;
    return 'permit_already_used';
  end if;

  if v_row.expires_at <= v_now then
    return 'permit_expired';
  end if;

  update public.notification_test_send_permits
  set
    consumed_at = v_now,
    consumed_request_id = p_request_id
  where id = p_permit_id;

  return 'consumed';
end;
$$;

revoke all on function public.issue_notification_test_send_permit(bigint, uuid, uuid) from public;
revoke all on function public.issue_notification_test_send_permit(bigint, uuid, uuid) from anon;
revoke all on function public.issue_notification_test_send_permit(bigint, uuid, uuid) from authenticated;
grant execute on function public.issue_notification_test_send_permit(bigint, uuid, uuid) to service_role;

revoke all on function public.consume_notification_test_send_permit(uuid, bigint, uuid, uuid, uuid) from public;
revoke all on function public.consume_notification_test_send_permit(uuid, bigint, uuid, uuid, uuid) from anon;
revoke all on function public.consume_notification_test_send_permit(uuid, bigint, uuid, uuid, uuid) from authenticated;
grant execute on function public.consume_notification_test_send_permit(uuid, bigint, uuid, uuid, uuid) to service_role;

-- Rollback (manual, only when permitsTotal = 0):
-- drop function if exists public.consume_notification_test_send_permit(uuid, bigint, uuid, uuid, uuid);
-- drop function if exists public.issue_notification_test_send_permit(bigint, uuid, uuid);
-- drop table if exists public.notification_test_send_permits;
