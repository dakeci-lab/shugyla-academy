-- Migration: self-service profile fields (contact email + own-profile update)
select pg_advisory_xact_lock(202607152000);

alter table public.academy_users
  add column if not exists contact_email text;

comment on column public.academy_users.contact_email is
  'Contact email for employee profile (not Supabase Auth login email)';

grant select (contact_email) on table public.academy_users to authenticated;

grant update (first_name, last_name, full_name, contact_email)
  on table public.academy_users
  to authenticated;

drop policy if exists academy_users_update_own_profile on public.academy_users;

create policy academy_users_update_own_profile
  on public.academy_users
  for update
  to authenticated
  using (
    auth.uid() is not null
    and auth_user_id = auth.uid()
  )
  with check (
    auth.uid() is not null
    and auth_user_id = auth.uid()
  );
