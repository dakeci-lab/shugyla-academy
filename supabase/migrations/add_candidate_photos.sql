-- Migration: candidate photos (Storage + DB columns)

-- Run after add_recruitment_module.sql
-- Also create bucket in Dashboard if this insert fails:
-- Supabase → Storage → New bucket → candidate-photos (public)

insert into storage.buckets (id, name, public)
values ('candidate-photos', 'candidate-photos', true)
on conflict (id) do update set public = true;

-- Public read
drop policy if exists "Public read candidate photos" on storage.objects;
create policy "Public read candidate photos"
  on storage.objects for select
  using (bucket_id = 'candidate-photos');

-- Anon upload (public apply form)
drop policy if exists "Anon upload candidate photos" on storage.objects;
create policy "Anon upload candidate photos"
  on storage.objects for insert
  with check (bucket_id = 'candidate-photos');

alter table academy_candidates
  add column if not exists photo_url text,
  add column if not exists photo_path text;

alter table academy_users
  add column if not exists avatar_url text;
