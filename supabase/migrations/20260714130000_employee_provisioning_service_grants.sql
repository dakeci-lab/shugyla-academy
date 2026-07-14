-- Service role grants for Edge Function employee provisioning (RBAC permission checks)

grant select on table public.roles to service_role;
grant select on table public.permissions to service_role;
grant select on table public.role_permissions to service_role;

notify pgrst, 'reload schema';
