-- Stage 3A transactional mutation tests (always ROLLBACK).
-- Impersonates an active admin via request.jwt.claim.sub for auth.uid().
-- Safe for production: creates only __stage3a_test__* rows and rolls back.

begin;

do $$
declare
  v_admin_auth uuid;
  v_non_admin_auth uuid;
  v_group jsonb;
  v_group2 jsonb;
  v_group3 jsonb;
  v_pos jsonb;
  v_pos2 jsonb;
  v_pos3 jsonb;
  v_empty_group jsonb;
  v_archived_group jsonb;
  v_renamed jsonb;
  v_moved jsonb;
  v_list jsonb;
  v_ids uuid[];
  v_active_ids uuid[];
  v_sorts int[];
  v_err text;
  v_detail text;
  v_users_before int;
  v_users_after int;
  v_roles_before int;
  v_roles_after int;
  v_perms_before int;
  v_employee_id bigint;
  v_employee_position_id uuid;
  v_employee_role text;
  v_employee_role_id uuid;
  v_employee_legacy text;
  v_test_position_id uuid;
  v_terminated_id bigint;
  v_active_count int;
begin
  select count(*)::int into v_users_before from public.academy_users;
  select count(*)::int into v_roles_before from public.roles;
  select count(*)::int into v_perms_before from public.permissions;

  select au.auth_user_id into v_admin_auth
  from public.academy_users au
  where au.status = 'active'
    and au.role = 'admin'
    and au.auth_user_id is not null
  order by au.id
  limit 1;

  if v_admin_auth is null then
    raise exception 'stage3a_sql_tests: no admin auth_user_id available';
  end if;

  select au.auth_user_id into v_non_admin_auth
  from public.academy_users au
  where au.status = 'active'
    and au.role is distinct from 'admin'
    and au.auth_user_id is not null
  order by au.id
  limit 1;

  perform set_config('request.jwt.claim.sub', v_admin_auth::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  if auth.uid() is distinct from v_admin_auth then
    raise exception 'stage3a_sql_tests: auth.uid impersonation failed';
  end if;

  if not auth_private.current_user_has_permission('positions.manage') then
    raise exception 'stage3a_sql_tests: admin missing positions.manage';
  end if;

  -- Permission denial for non-admin
  if v_non_admin_auth is not null then
    perform set_config('request.jwt.claim.sub', v_non_admin_auth::text, true);
    if auth_private.current_user_has_permission('positions.manage') then
      raise exception 'stage3a_sql_tests: non-admin unexpectedly has positions.manage';
    end if;
    begin
      perform public.position_structure_create_group('__stage3a_test__denied__');
      raise exception 'stage3a_sql_tests: non-admin create should fail';
    exception
      when others then
        get stacked diagnostics v_err = message_text;
        if v_err is distinct from 'position_structure_forbidden' then
          raise exception 'stage3a_sql_tests: expected forbidden, got %', v_err;
        end if;
    end;
    perform set_config('request.jwt.claim.sub', v_admin_auth::text, true);
  end if;

  -- Create group validations
  begin
    perform public.position_structure_create_group('   ');
    raise exception 'stage3a_sql_tests: blank group name should fail';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err is distinct from 'invalid_group_name' then
      raise exception 'stage3a_sql_tests: blank name code=%', v_err;
    end if;
  end;

  begin
    perform public.position_structure_create_group('');
    raise exception 'stage3a_sql_tests: empty group name should fail';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err is distinct from 'invalid_group_name' then
      raise exception 'stage3a_sql_tests: empty name code=%', v_err;
    end if;
  end;

  v_group := public.position_structure_create_group('__stage3a_test__group_a__', 'desc a', null);
  if (v_group->>'name') is distinct from '__stage3a_test__group_a__' then
    raise exception 'stage3a_sql_tests: create group failed';
  end if;
  if (v_group->>'is_active')::boolean is not true then
    raise exception 'stage3a_sql_tests: created group not active';
  end if;
  if (v_group->>'sort_order')::int % 10 <> 0 then
    raise exception 'stage3a_sql_tests: default sort_order not stepped by 10';
  end if;

  begin
    perform public.position_structure_create_group('__stage3a_test__group_a__');
    raise exception 'stage3a_sql_tests: duplicate exact should fail';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err is distinct from 'position_group_duplicate_name' then
      raise exception 'stage3a_sql_tests: duplicate exact code=%', v_err;
    end if;
  end;

  begin
    perform public.position_structure_create_group('__STAGE3A_TEST__GROUP_A__');
    raise exception 'stage3a_sql_tests: duplicate case should fail';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err is distinct from 'position_group_duplicate_name' then
      raise exception 'stage3a_sql_tests: duplicate case code=%', v_err;
    end if;
  end;

  begin
    perform public.position_structure_create_group('  __stage3a_test__group_a__  ');
    raise exception 'stage3a_sql_tests: duplicate spaces should fail';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err is distinct from 'position_group_duplicate_name' then
      raise exception 'stage3a_sql_tests: duplicate spaces code=%', v_err;
    end if;
  end;

  begin
    perform public.position_structure_create_group('__stage3a_test__bad_sort__', null, -1);
    raise exception 'stage3a_sql_tests: negative sort should fail';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err is distinct from 'invalid_sort_order' then
      raise exception 'stage3a_sql_tests: invalid sort code=%', v_err;
    end if;
  end;

  -- Update group
  v_group := public.position_structure_update_group(
    (v_group->>'id')::uuid,
    '__stage3a_test__group_a_renamed__',
    'desc updated',
    777
  );
  if (v_group->>'name') is distinct from '__stage3a_test__group_a_renamed__' then
    raise exception 'stage3a_sql_tests: group rename failed';
  end if;
  if (v_group->>'description') is distinct from 'desc updated' then
    raise exception 'stage3a_sql_tests: group description update failed';
  end if;
  if (v_group->>'sort_order')::int <> 777 then
    raise exception 'stage3a_sql_tests: group sort update failed';
  end if;

  v_group2 := public.position_structure_create_group('__stage3a_test__group_b__');
  begin
    perform public.position_structure_update_group(
      (v_group2->>'id')::uuid,
      '__stage3a_test__group_a_renamed__',
      null,
      10
    );
    raise exception 'stage3a_sql_tests: duplicate rename should fail';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err is distinct from 'position_group_duplicate_name' then
      raise exception 'stage3a_sql_tests: duplicate rename code=%', v_err;
    end if;
  end;

  -- Empty group archive/restore
  v_empty_group := public.position_structure_create_group('__stage3a_test__empty__');
  v_archived_group := public.position_structure_set_group_active((v_empty_group->>'id')::uuid, false);
  if (v_archived_group->>'is_active')::boolean is not false then
    raise exception 'stage3a_sql_tests: empty group archive failed';
  end if;
  if v_archived_group->>'archived_at' is null then
    raise exception 'stage3a_sql_tests: archived_at not set';
  end if;
  v_archived_group := public.position_structure_set_group_active((v_empty_group->>'id')::uuid, true);
  if (v_archived_group->>'is_active')::boolean is not true then
    raise exception 'stage3a_sql_tests: group restore failed';
  end if;

  -- Create positions
  v_pos := public.position_structure_create_position(
    (v_group->>'id')::uuid,
    '__stage3a_test__pos_a__',
    'pdesc',
    null
  );
  if (v_pos->>'group_id') is distinct from (v_group->>'id') then
    raise exception 'stage3a_sql_tests: position group_id mismatch';
  end if;
  if (v_pos->>'group_name') is distinct from '__stage3a_test__group_a_renamed__' then
    raise exception 'stage3a_sql_tests: position missing group metadata';
  end if;

  begin
    perform public.position_structure_create_position(
      (v_archived_group->>'id')::uuid,
      '__stage3a_test__pos_in_archived__'
    );
    -- restore then archive again for inactive group test
  exception when others then
    null;
  end;

  -- Make a dedicated archived group for inactive create test
  v_group3 := public.position_structure_create_group('__stage3a_test__archived_target__');
  perform public.position_structure_set_group_active((v_group3->>'id')::uuid, false);
  begin
    perform public.position_structure_create_position(
      (v_group3->>'id')::uuid,
      '__stage3a_test__pos_blocked__'
    );
    raise exception 'stage3a_sql_tests: create in archived group should fail';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err is distinct from 'position_group_inactive' then
      raise exception 'stage3a_sql_tests: archived group create code=%', v_err;
    end if;
  end;

  begin
    perform public.position_structure_create_position(
      (v_group->>'id')::uuid,
      '__stage3a_test__pos_a__'
    );
    raise exception 'stage3a_sql_tests: duplicate position should fail';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err is distinct from 'position_duplicate_name' then
      raise exception 'stage3a_sql_tests: duplicate position code=%', v_err;
    end if;
  end;

  begin
    perform public.position_structure_create_position(
      (v_group->>'id')::uuid,
      '__STAGE3A_TEST__POS_A__'
    );
    raise exception 'stage3a_sql_tests: case duplicate position should fail';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err is distinct from 'position_duplicate_name' then
      raise exception 'stage3a_sql_tests: case duplicate position code=%', v_err;
    end if;
  end;

  if exists (select 1 from public.roles where lower(btrim(name)) = lower('__stage3a_test__pos_a__')) then
    raise exception 'stage3a_sql_tests: role was created for position';
  end if;
  if exists (select 1 from public.academy_users where position_id = (v_pos->>'id')::uuid) then
    raise exception 'stage3a_sql_tests: employee auto-assigned';
  end if;

  -- Group with active positions cannot archive
  begin
    perform public.position_structure_set_group_active((v_group->>'id')::uuid, false);
    raise exception 'stage3a_sql_tests: archive group with positions should fail';
  exception when others then
    get stacked diagnostics v_err = message_text;
    get stacked diagnostics v_detail = pg_exception_detail;
    if v_err is distinct from 'position_group_has_active_positions' then
      raise exception 'stage3a_sql_tests: archive group code=%', v_err;
    end if;
  end;

  -- Update / rename with legacy sync using a disposable employee clone fields via temp update
  select au.id, au.position_id, au.role, au.role_id, au.position
  into v_employee_id, v_employee_position_id, v_employee_role, v_employee_role_id, v_employee_legacy
  from public.academy_users au
  where au.status = 'active'
  order by au.id
  limit 1;

  v_test_position_id := (v_pos->>'id')::uuid;
  update public.academy_users
  set position_id = v_test_position_id,
      position = '__stage3a_test__pos_a__'
  where id = v_employee_id;

  v_renamed := public.position_structure_update_position(
    v_test_position_id,
    (v_group->>'id')::uuid,
    '__stage3a_test__pos_a_renamed__',
    'pdesc2',
    55
  );
  if (v_renamed->>'name') is distinct from '__stage3a_test__pos_a_renamed__' then
    raise exception 'stage3a_sql_tests: position rename failed';
  end if;

  if exists (
    select 1 from public.academy_users
    where id = v_employee_id
      and (
        position_id is distinct from v_test_position_id
        or role is distinct from v_employee_role
        or role_id is distinct from v_employee_role_id
        or position is distinct from '__stage3a_test__pos_a_renamed__'
      )
  ) then
    raise exception 'stage3a_sql_tests: legacy sync / identity assertion failed';
  end if;

  -- Move between active groups
  v_moved := public.position_structure_update_position(
    v_test_position_id,
    (v_group2->>'id')::uuid,
    '__stage3a_test__pos_a_renamed__',
    'pdesc2',
    55
  );
  if (v_moved->>'group_id') is distinct from (v_group2->>'id') then
    raise exception 'stage3a_sql_tests: move between groups failed';
  end if;
  if exists (
    select 1 from public.academy_users
    where id = v_employee_id and position_id is distinct from v_test_position_id
  ) then
    raise exception 'stage3a_sql_tests: move changed employee position_id';
  end if;

  begin
    perform public.position_structure_update_position(
      v_test_position_id,
      (v_group3->>'id')::uuid,
      '__stage3a_test__pos_a_renamed__',
      'pdesc2',
      55
    );
    raise exception 'stage3a_sql_tests: move to archived group should fail';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err is distinct from 'position_target_group_inactive' then
      raise exception 'stage3a_sql_tests: move archived target code=%', v_err;
    end if;
  end;

  -- Archive blocked by active employee
  begin
    perform public.position_structure_set_position_active(v_test_position_id, false);
    raise exception 'stage3a_sql_tests: archive with active employee should fail';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err is distinct from 'position_has_active_employees' then
      raise exception 'stage3a_sql_tests: active employee archive code=%', v_err;
    end if;
  end;

  -- Restore employee original assignment before further archive tests
  update public.academy_users
  set position_id = v_employee_position_id,
      position = v_employee_legacy
  where id = v_employee_id;

  -- Position with only terminated employees can archive
  v_pos2 := public.position_structure_create_position(
    (v_group2->>'id')::uuid,
    '__stage3a_test__pos_terminated_only__'
  );
  select au.id into v_terminated_id
  from public.academy_users au
  where au.status = 'terminated'
  order by au.id
  limit 1;

  if v_terminated_id is not null then
    update public.academy_users
    set position_id = (v_pos2->>'id')::uuid,
        position = '__stage3a_test__pos_terminated_only__'
    where id = v_terminated_id;

    perform public.position_structure_set_position_active((v_pos2->>'id')::uuid, false);

    if exists (
      select 1 from public.academy_users
      where id = v_terminated_id
        and (
          position_id is distinct from (v_pos2->>'id')::uuid
          or position is distinct from '__stage3a_test__pos_terminated_only__'
        )
    ) then
      raise exception 'stage3a_sql_tests: terminated employee lost position link';
    end if;

    -- restore parent still active -> restore position ok
    perform public.position_structure_set_position_active((v_pos2->>'id')::uuid, true);
  else
    -- no terminated users in env: still verify empty position archive
    perform public.position_structure_set_position_active((v_pos2->>'id')::uuid, false);
    perform public.position_structure_set_position_active((v_pos2->>'id')::uuid, true);
  end if;

  -- Restore forbidden when parent archived
  perform public.position_structure_set_position_active((v_pos2->>'id')::uuid, false);
  -- move archived position is forbidden via update
  begin
    perform public.position_structure_update_position(
      (v_pos2->>'id')::uuid,
      (v_group->>'id')::uuid,
      '__stage3a_test__pos_terminated_only__',
      null,
      10
    );
    raise exception 'stage3a_sql_tests: update archived position should fail';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err is distinct from 'position_inactive' then
      raise exception 'stage3a_sql_tests: archived update code=%', v_err;
    end if;
  end;

  -- Put position into archived group path: archive group after emptying active positions
  -- First restore pos2, move all active test positions out, etc. Simpler path:
  perform public.position_structure_set_position_active((v_pos2->>'id')::uuid, true);
  update public.positions
  set group_id = (v_group3->>'id')::uuid
  where id = (v_pos2->>'id')::uuid;
  -- group3 is archived; restore position should fail
  perform public.position_structure_set_position_active((v_pos2->>'id')::uuid, false);
  begin
    perform public.position_structure_set_position_active((v_pos2->>'id')::uuid, true);
    raise exception 'stage3a_sql_tests: restore under archived parent should fail';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err is distinct from 'position_parent_group_inactive' then
      raise exception 'stage3a_sql_tests: parent inactive restore code=%', v_err;
    end if;
  end;

  -- Reorder groups (full active set)
  select coalesce(array_agg(g.id order by g.sort_order desc, g.name, g.id), array[]::uuid[])
  into v_active_ids
  from public.position_groups g
  where g.is_active = true;

  v_list := public.position_structure_reorder_groups(v_active_ids);
  select array_agg((x->>'sort_order')::int order by ord)
  into v_sorts
  from jsonb_array_elements(v_list) with ordinality as t(x, ord);
  if v_sorts is distinct from (
    select array_agg(i * 10 order by i)
    from generate_series(1, cardinality(v_sorts)) as g(i)
  ) then
    raise exception 'stage3a_sql_tests: group reorder sort_order not 10,20,30...';
  end if;

  begin
    perform public.position_structure_reorder_groups(array[v_active_ids[1], v_active_ids[1]]);
    raise exception 'stage3a_sql_tests: duplicate reorder ids should fail';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err is distinct from 'duplicate_reorder_id' then
      raise exception 'stage3a_sql_tests: duplicate reorder code=%', v_err;
    end if;
  end;

  begin
    perform public.position_structure_reorder_groups(v_active_ids[1:greatest(cardinality(v_active_ids)-1,1)]);
    raise exception 'stage3a_sql_tests: missing reorder id should fail';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err not in ('reorder_items_missing', 'invalid_reorder_payload') then
      raise exception 'stage3a_sql_tests: missing reorder code=%', v_err;
    end if;
  end;

  begin
    perform public.position_structure_reorder_groups(
      array_append(v_active_ids[1:cardinality(v_active_ids)-1], gen_random_uuid())
    );
    raise exception 'stage3a_sql_tests: unknown reorder id should fail';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err not in ('position_group_not_found', 'reorder_items_missing', 'position_group_inactive') then
      raise exception 'stage3a_sql_tests: unknown reorder code=%', v_err;
    end if;
  end;

  -- Reorder positions inside group2
  v_pos3 := public.position_structure_create_position(
    (v_group2->>'id')::uuid,
    '__stage3a_test__pos_c__'
  );
  -- ensure pos_a_renamed is in group2 already
  select coalesce(array_agg(p.id order by p.sort_order desc, p.name, p.id), array[]::uuid[])
  into v_ids
  from public.positions p
  where p.group_id = (v_group2->>'id')::uuid
    and p.is_active = true;

  v_list := public.position_structure_reorder_positions((v_group2->>'id')::uuid, v_ids);
  select array_agg((x->>'sort_order')::int order by ord)
  into v_sorts
  from jsonb_array_elements(v_list) with ordinality as t(x, ord);
  if v_sorts is distinct from (
    select array_agg(i * 10 order by i)
    from generate_series(1, cardinality(v_sorts)) as g(i)
  ) then
    raise exception 'stage3a_sql_tests: position reorder sort_order not 10,20,30...';
  end if;

  begin
    perform public.position_structure_reorder_positions(
      (v_group2->>'id')::uuid,
      array[v_ids[1], v_ids[1]]
    );
    raise exception 'stage3a_sql_tests: position duplicate reorder should fail';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err is distinct from 'duplicate_reorder_id' then
      raise exception 'stage3a_sql_tests: position duplicate reorder code=%', v_err;
    end if;
  end;

  if cardinality(v_ids) >= 1 then
    select p.id into v_test_position_id
    from public.positions p
    where p.is_active = true
      and p.group_id is distinct from (v_group2->>'id')::uuid
    limit 1;

    if v_test_position_id is not null then
      begin
        perform public.position_structure_reorder_positions(
          (v_group2->>'id')::uuid,
          array_append(v_ids[1:cardinality(v_ids)-1], v_test_position_id)
        );
        raise exception 'stage3a_sql_tests: foreign reorder should fail';
      exception when others then
        get stacked diagnostics v_err = message_text;
        if v_err not in ('reorder_foreign_item', 'reorder_items_missing') then
          raise exception 'stage3a_sql_tests: foreign reorder code=%', v_err;
        end if;
      end;
    end if;
  end if;

  -- Direct write denial for authenticated role (table privileges)
  if has_table_privilege('authenticated', 'public.position_groups', 'INSERT')
     or has_table_privilege('authenticated', 'public.position_groups', 'UPDATE')
     or has_table_privilege('authenticated', 'public.position_groups', 'DELETE')
     or has_table_privilege('authenticated', 'public.positions', 'INSERT')
     or has_table_privilege('authenticated', 'public.positions', 'UPDATE')
     or has_table_privilege('authenticated', 'public.positions', 'DELETE')
  then
    raise exception 'stage3a_sql_tests: authenticated has direct write privilege';
  end if;

  if has_function_privilege('anon', 'public.position_structure_create_group(text,text,integer)', 'EXECUTE') then
    raise exception 'stage3a_sql_tests: anon has EXECUTE';
  end if;

  if has_function_privilege('public', 'public.position_structure_create_group(text,text,integer)', 'EXECUTE') then
    raise exception 'stage3a_sql_tests: PUBLIC has EXECUTE';
  end if;

  select count(*)::int into v_users_after from public.academy_users;
  select count(*)::int into v_roles_after from public.roles;
  if v_users_after <> v_users_before then
    raise exception 'stage3a_sql_tests: user count changed';
  end if;
  if v_roles_after <> v_roles_before then
    raise exception 'stage3a_sql_tests: roles count changed';
  end if;
  if (select count(*)::int from public.permissions) < v_perms_before then
    raise exception 'stage3a_sql_tests: permissions removed';
  end if;

  -- Ensure no hard-delete functions
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'position_structure_delete%'
  ) then
    raise exception 'stage3a_sql_tests: hard delete RPC exists';
  end if;

  raise notice 'Stage 3A SQL verification OK';
end $$;

rollback;
