-- Production Auth bridge — Phase 1 (additive only)
-- DO NOT combine with security cutover. Safe for zero-downtime while legacy frontend remains.
--
-- Adds:
--   academy_users.auth_user_id (nullable)
--   FK to auth.users ON DELETE SET NULL
--   partial UNIQUE index on non-null auth_user_id
--   auth_private helpers + technical email function
--
-- Does NOT:
--   drop legacy policies, revoke anon grants, backfill auth_user_id,
--   create Auth users, clear passwords, or touch notification tables.

select pg_advisory_xact_lock(202607142000);

-- ---------------------------------------------------------------------------
-- 1. Technical email helper (mirrors loginToTechnicalEmail in phoneUtils.js)
-- ---------------------------------------------------------------------------

create schema if not exists auth_private;

revoke all on schema auth_private from public;
revoke all on schema auth_private from anon;

create or replace function auth_private.login_to_technical_email(p_login text)
returns text
language plpgsql
immutable
as $$
declare
  v_login text := trim(coalesce(p_login, ''));
  v_digits text;
begin
  if v_login = '' then
    return null;
  end if;

  if position('@' in v_login) > 0 then
    return lower(v_login);
  end if;

  v_digits := regexp_replace(v_login, '[\s\(\)-]', '', 'g');
  v_digits := regexp_replace(v_digits, '^\+', '');
  v_digits := regexp_replace(v_digits, '\D', '', 'g');

  if length(v_digits) = 11 and left(v_digits, 1) = '8' then
    v_digits := '7' || substring(v_digits from 2);
  end if;

  if v_digits ~ '^7\d{10}$' then
    return v_digits || '@shugyla.local';
  end if;

  return lower(v_login) || '@shugyla.local';
end;
$$;

comment on function auth_private.login_to_technical_email(text) is
  'Computes Supabase Auth technical email from academy_users.login (mirrors loginToTechnicalEmail).';

revoke all on function auth_private.login_to_technical_email(text) from public;
revoke all on function auth_private.login_to_technical_email(text) from anon;
grant execute on function auth_private.login_to_technical_email(text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Ownership helper for later RLS (Phase 2)
-- ---------------------------------------------------------------------------

create or replace function auth_private.employee_owned_by_current_auth(p_employee_id bigint)
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

comment on function auth_private.employee_owned_by_current_auth(bigint) is
  'True when p_employee_id belongs to auth.uid(). Used by RLS after Auth cutover.';

revoke all on function auth_private.employee_owned_by_current_auth(bigint) from public;
revoke all on function auth_private.employee_owned_by_current_auth(bigint) from anon;

-- ---------------------------------------------------------------------------
-- 3. auth_user_id column + constraints (additive)
-- ---------------------------------------------------------------------------

alter table public.academy_users
  add column if not exists auth_user_id uuid;

alter table public.academy_users
  drop constraint if exists academy_users_auth_user_id_fkey;

alter table public.academy_users
  add constraint academy_users_auth_user_id_fkey
  foreign key (auth_user_id)
  references auth.users (id)
  on delete set null;

alter table public.academy_users
  drop constraint if exists academy_users_auth_user_id_unique;

drop index if exists idx_academy_users_auth_user_id_unique;

create unique index if not exists idx_academy_users_auth_user_id_unique
  on public.academy_users (auth_user_id)
  where auth_user_id is not null;

notify pgrst, 'reload schema';
