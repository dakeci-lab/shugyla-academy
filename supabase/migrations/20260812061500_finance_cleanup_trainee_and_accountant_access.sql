-- ---------------------------------------------------------------------------
-- Three owner decisions from 2026-08-12:
--
--   1. The «Финансы» module is removed. It never existed as a screen — only as
--      two permission codes nobody could grant (the module is not part of the
--      RBAC matrix). A right that looks real but leads nowhere costs more than
--      it gives: it invites someone to tick it and expect a section to appear.
--
--   2. The `trainee` role is deleted. Nobody has ever been assigned to it.
--
--   3. The accountant (`buhgalter`) gets real permissions. Right now the role
--      has zero, so a live employee sees only the fallback minimum — the home
--      page and the standards. The set below covers exactly the work named by
--      the owner: payroll, settlements with suppliers, supplier payments.
--
-- Employee rows are never modified. Preflight fails closed.
-- ---------------------------------------------------------------------------

select pg_advisory_xact_lock(202608120615);

do $$
declare
  v_accountant_permissions text[] := array[
    'dashboard.view',
    'payroll.view',
    'payroll.calculate',
    'umag.settlements.view',
    'umag.reconciliations.view',
    'supplier_payments.view',
    'supplier_payments.manage',
    'suppliers.view'
  ];
  v_role_id uuid;
  v_trainee_employees integer;
  v_missing text[];
  v_granted integer;
begin
  -- ---------------------------------------------------------------------
  -- 1. Finance module
  -- ---------------------------------------------------------------------
  -- role_permissions cascades, so any role that had these loses them here.
  delete from public.permissions where code in ('finance.view', 'finance.manage');

  -- ---------------------------------------------------------------------
  -- 2. trainee role
  -- ---------------------------------------------------------------------
  select count(*) into v_trainee_employees
  from public.academy_users u
  join public.roles r on r.id = u.role_id
  where r.code = 'trainee';

  if v_trainee_employees > 0 then
    raise exception
      'Preflight failed: role trainee has % employee(s) (including inactive)',
      v_trainee_employees;
  end if;

  delete from public.roles where code = 'trainee';

  -- ---------------------------------------------------------------------
  -- 3. Accountant permissions
  -- ---------------------------------------------------------------------
  select id into v_role_id from public.roles where code = 'buhgalter';

  if v_role_id is null then
    raise exception 'Preflight failed: role buhgalter not found';
  end if;

  -- Every code must exist, otherwise a typo would silently grant less.
  select array_agg(code) into v_missing
  from unnest(v_accountant_permissions) as code
  where not exists (
    select 1 from public.permissions p where p.code = code
  );

  if v_missing is not null then
    raise exception 'Preflight failed: unknown permission code(s): %', v_missing;
  end if;

  insert into public.role_permissions (role_id, permission_id)
  select v_role_id, p.id
  from public.permissions p
  where p.code = any(v_accountant_permissions)
  on conflict do nothing;

  select count(*) into v_granted
  from public.role_permissions rp
  where rp.role_id = v_role_id;

  if v_granted < array_length(v_accountant_permissions, 1) then
    raise exception
      'Postcheck failed: accountant has % permission(s), expected at least %',
      v_granted, array_length(v_accountant_permissions, 1);
  end if;
end;
$$;
