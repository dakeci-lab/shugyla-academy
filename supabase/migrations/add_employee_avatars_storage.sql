-- Storage bucket для аватарок сотрудников

insert into storage.buckets (id, name, public)
values ('employee-avatars', 'employee-avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read employee avatars" on storage.objects;
create policy "Public read employee avatars"
  on storage.objects for select
  using (bucket_id = 'employee-avatars');

drop policy if exists "Anon upload employee avatars" on storage.objects;
create policy "Anon upload employee avatars"
  on storage.objects for insert
  with check (bucket_id = 'employee-avatars');

drop policy if exists "Anon update employee avatars" on storage.objects;
create policy "Anon update employee avatars"
  on storage.objects for update
  using (bucket_id = 'employee-avatars')
  with check (bucket_id = 'employee-avatars');

drop policy if exists "Anon delete employee avatars" on storage.objects;
create policy "Anon delete employee avatars"
  on storage.objects for delete
  using (bucket_id = 'employee-avatars');

-- Поле avatar_url уже добавлено в add_candidate_photos.sql
-- alter table academy_users add column if not exists avatar_url text;
