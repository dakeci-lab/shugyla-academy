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
--   1. detaches ONE precisely identified demo assignment (see below);
--   2. deletes the four roles that then carry no employees at all, any status;
--   3. adds a unique index on the normalized display name, so the next attempt
--      fails loudly instead of producing name_2.
--
-- About employee rows. One leftover demo record still points at the test role:
-- academy_users id 17, «Тест RBAC», status terminated, role testovaya_rol_rbac.
-- Its role_id is set to null so the role can go. The employee row itself stays —
-- history is not ours to erase. The UPDATE matches id, full name, status AND the
-- current role at once, so it cannot touch anybody else even by accident.
--
-- Every other assignment blocks this migration: the preflight below counts
-- employees of ANY status for each target role and raises. Deactivated and
-- terminated people count — the audit query that listed only active employees is
-- exactly how the id 17 record was missed in the first place.
-- ---------------------------------------------------------------------------

select pg_advisory_xact_lock(202608120520);

do $$
declare
  v_targets text[] := array['finansist', 'kategoriynyy_menedzher', 'testovaya_rol_rbac', 'purchaser'];
  v_code text;
  v_employees integer;
  v_remaining_duplicates integer;
  v_detached integer;
begin
  -- 0. The single known demo assignment, matched on every field at once:
  --    id, full name, terminated status and the exact current role. Anything
  --    that does not match all four is left alone and will trip the preflight.
  update public.academy_users u
     set role_id = null
   where u.id = 17
     and u.full_name = 'Тест RBAC'
     and u.status = 'terminated'
     and u.role_id = (
       select r.id from public.roles r where r.code = 'testovaya_rol_rbac'
     );

  get diagnostics v_detached = row_count;
  raise notice 'Detached demo assignments from testovaya_rol_rbac: %', v_detached;

  -- 1. Fail closed: never delete a role somebody still sits on. Counts every
  --    status, so a terminated or deactivated person is enough to stop this.
  foreach v_code in array v_targets loop
    select count(*) into v_employees
    from public.academy_users u
    join public.roles r on r.id = u.role_id
    where r.code = v_code;

    if v_employees > 0 then
      raise exception
        'Preflight failed: role % still has % employee(s) of any status — resolve them by hand',
        v_code, v_employees;
    end if;
  end loop;

  -- 2. Delete. role_permissions cascade; academy_users.role_id is ON DELETE SET NULL
  --    but cannot fire here because the preflight above proved there are no rows
  --    left pointing at these roles.
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
