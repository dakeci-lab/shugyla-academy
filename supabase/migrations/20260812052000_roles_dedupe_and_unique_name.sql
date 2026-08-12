-- ---------------------------------------------------------------------------
-- Roles: remove duplicates and stop new ones from appearing.
--
-- How the duplicates got there: 20260712163000_complete_flexible_rbac.sql:184
-- created a role per distinct value of the legacy free-text academy_users.role
-- column, then inserted six curated system roles on top. Where a legacy value
-- meant the same job as a curated role, two rows ended up with the same display
-- name. The frontend papered over it by appending «— без сотрудников» to the
-- name (src/utils/roleDisplay.js), which leaked into every dropdown.
--
-- A second source: the UI generates a role code by slugifying the name and
-- silently appending _2 on collision, so «Финансист» could be created twice
-- (finansist, finansist_2) without a word to the user.
--
-- This migration:
--   1. deletes the four roles that carry no employees at all (any status);
--   2. adds a unique index on the normalized display name, so the next attempt
--      fails loudly instead of producing name_2.
--
-- Employees are not touched. Preflight refuses if any target role turns out to
-- have an employee — including deactivated ones, which the audit query missed.
-- ---------------------------------------------------------------------------

select pg_advisory_xact_lock(202608120520);

do $$
declare
  v_targets text[] := array['finansist', 'kategoriynyy_menedzher', 'testovaya_rol_rbac', 'purchaser'];
  v_code text;
  v_employees integer;
  v_remaining_duplicates integer;
begin
  -- 1. Fail closed: never delete a role somebody still sits on.
  foreach v_code in array v_targets loop
    select count(*) into v_employees
    from public.academy_users u
    join public.roles r on r.id = u.role_id
    where r.code = v_code;

    if v_employees > 0 then
      raise exception
        'Preflight failed: role % still has % employee(s) (including inactive)',
        v_code, v_employees;
    end if;
  end loop;

  -- 2. Delete. role_permissions cascade; academy_users.role_id is ON DELETE SET NULL
  --    but cannot fire here because the preflight above proved there are no rows.
  delete from public.roles where code = any(v_targets);

  -- 3. Nothing may be left sharing a normalized name, otherwise the index below
  --    cannot be created and we would rather know why.
  select count(*) into v_remaining_duplicates
  from (
    select lower(btrim(name)) as norm
    from public.roles
    group by lower(btrim(name))
    having count(*) > 1
  ) as dupes;

  if v_remaining_duplicates > 0 then
    raise exception
      'Preflight failed: % duplicate role name(s) remain — resolve them before adding the unique index',
      v_remaining_duplicates;
  end if;
end;
$$;

-- Names are unique from now on, archived roles included: a freed name must be
-- freed deliberately (rename or delete), not by accident.
create unique index if not exists roles_name_norm_uidx
  on public.roles (lower(btrim(name)));

comment on index public.roles_name_norm_uidx is
  'Display names are unique. Prevents the name_2 duplicates the UI used to create silently.';
