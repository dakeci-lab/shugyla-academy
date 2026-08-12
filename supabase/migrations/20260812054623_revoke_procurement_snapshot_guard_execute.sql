-- Prevent direct API execution of the SECURITY DEFINER trigger function.
-- The trigger remains attached to procurement_snapshot_items; this function
-- is an internal invariant guard and is not intended to be called as an RPC.

revoke all on function public.procurement_snapshot_items_guard_update() from public;
revoke all on function public.procurement_snapshot_items_guard_update() from anon;
revoke all on function public.procurement_snapshot_items_guard_update() from authenticated;
revoke all on function public.procurement_snapshot_items_guard_update() from service_role;
