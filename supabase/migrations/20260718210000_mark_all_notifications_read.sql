-- Mark all unread in-app notifications for the current user as read.

create or replace function notification_private.mark_all_notifications_read_internal()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.notifications as n
  set read_at = now()
  where n.auth_user_id = auth.uid()
    and n.read_at is null
    and (n.expires_at is null or n.expires_at > now());

  return true;
end;
$$;

comment on function notification_private.mark_all_notifications_read_internal() is
  'Private bulk mark-own-notifications-read. Used only by public SECURITY INVOKER RPC wrapper.';

revoke all on function notification_private.mark_all_notifications_read_internal() from public;
revoke all on function notification_private.mark_all_notifications_read_internal() from anon;
revoke all on function notification_private.mark_all_notifications_read_internal() from authenticated;

grant execute on function notification_private.mark_all_notifications_read_internal() to authenticated;
grant execute on function notification_private.mark_all_notifications_read_internal() to service_role;

create or replace function public.mark_all_notifications_read()
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select notification_private.mark_all_notifications_read_internal();
$$;

comment on function public.mark_all_notifications_read() is
  'Public RPC wrapper to mark all of the caller''s unread notifications as read.';

revoke all on function public.mark_all_notifications_read() from public;
revoke all on function public.mark_all_notifications_read() from anon;
revoke all on function public.mark_all_notifications_read() from authenticated;

grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.mark_all_notifications_read() to service_role;
