-- Stage 17 apply: remove positions and position groups. Run ONLY after the frontend and Edge Functions without
-- positions are deployed and confirmed (older clients select academy_users.position / position_id).
-- No CASCADE, no IF EXISTS: any unexpected dependency aborts the whole transaction.
begin;

select pg_advisory_xact_lock(202610171701);

-- 1. permissions positions.view / positions.manage
delete from public.role_permissions rp using public.permissions p
 where p.id = rp.permission_id and p.code in ('positions.view', 'positions.manage');
delete from public.permissions where code in ('positions.view', 'positions.manage');

-- 2. RPC functions
drop function public.position_structure_create_group(text, text, integer);
drop function public.position_structure_create_position(uuid, text, text, integer);
drop function public.position_structure_reorder_groups(uuid[]);
drop function public.position_structure_reorder_positions(uuid, uuid[]);
drop function public.position_structure_set_group_active(uuid, boolean);
drop function public.position_structure_set_position_active(uuid, boolean);
drop function public.position_structure_update_group(uuid, text, text, integer);
drop function public.position_structure_update_position(uuid, uuid, text, text, integer);

-- 2b. private helper schema used only by the functions above
drop function position_structure_private.assert_can_manage();
drop function position_structure_private.normalize_name(text, text);
drop function position_structure_private.normalize_description(text);
drop function position_structure_private.validate_sort_order(integer);
drop function position_structure_private.next_group_sort_order();
drop function position_structure_private.next_position_sort_order(uuid);
drop function position_structure_private.group_to_json(public.position_groups);
drop function position_structure_private.position_to_json(public.positions);
drop function position_structure_private.raise_code(text, text);
drop schema position_structure_private;

-- 3. columns and tables
drop index public.idx_academy_users_position_id;
alter table public.academy_users drop constraint academy_users_position_id_fkey;
alter table public.academy_users drop column position_id;
alter table public.academy_users drop column position;
drop table public.positions;
drop table public.position_groups;

commit;
