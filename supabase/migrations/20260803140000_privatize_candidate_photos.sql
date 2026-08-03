-- Stage 2.1: privatize candidate-photos, tighten upload policies, path-first storage.
-- Idempotent. Does not delete orphan objects.

-- ---------------------------------------------------------------------------
-- 1) Bucket: private + MIME/size limits
-- ---------------------------------------------------------------------------

update storage.buckets
set
  public = false,
  file_size_limit = 5242880, -- 5 MiB (matches frontend MAX_CANDIDATE_PHOTO_BYTES)
  allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
where id = 'candidate-photos';

-- ---------------------------------------------------------------------------
-- 2) Backfill photo_path from public CDN URL when path missing
-- ---------------------------------------------------------------------------

update public.academy_candidates c
set photo_path = nullif(
  btrim(
    split_part(c.photo_url, '/storage/v1/object/public/candidate-photos/', 2)
  ),
  ''
)
where (c.photo_path is null or btrim(c.photo_path) = '')
  and c.photo_url like '%/storage/v1/object/public/candidate-photos/%'
  and nullif(
    btrim(split_part(c.photo_url, '/storage/v1/object/public/candidate-photos/', 2)),
    ''
  ) is not null
  and exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'candidate-photos'
      and o.name = nullif(
        btrim(split_part(c.photo_url, '/storage/v1/object/public/candidate-photos/', 2)),
        ''
      )
  );

-- Drop permanent public URLs once a storage path is known (signed URLs are ephemeral).
update public.academy_candidates
set photo_url = null
where photo_path is not null
  and btrim(photo_url) <> ''
  and photo_url like '%/storage/v1/object/%candidate-photos/%';

-- ---------------------------------------------------------------------------
-- 3) Storage policies
-- ---------------------------------------------------------------------------

drop policy if exists "Public read candidate photos" on storage.objects;
drop policy if exists "Anon upload candidate photos" on storage.objects;
drop policy if exists candidate_photos_anon_insert on storage.objects;
drop policy if exists candidate_photos_anon_select on storage.objects;
drop policy if exists candidate_photos_authenticated_select on storage.objects;
drop policy if exists candidate_photos_anon_update on storage.objects;
drop policy if exists candidate_photos_anon_delete on storage.objects;
drop policy if exists candidate_photos_hr_select on storage.objects;

-- Anon/authenticated: insert only into applications/{uuid}.{ext}, no upsert path reuse via UPDATE.
create policy candidate_photos_anon_insert
  on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'candidate-photos'
    and name ~* '^applications/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp)$'
  );

-- HR read for signed URLs / download (permission-gated).
create policy candidate_photos_hr_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'candidate-photos'
    and (
      auth_private.current_user_has_permission('recruitment.view')
      or auth_private.current_user_has_permission('recruitment.manage_candidates')
      or auth_private.current_user_has_permission('recruitment.hire_candidate')
    )
  );

-- No UPDATE/DELETE policies for anon or authenticated on this bucket
-- (service_role / dashboard only). Overwrite via upsert is blocked without UPDATE.

-- ---------------------------------------------------------------------------
-- 4) Harden submit RPC: store path only; reject public URLs / bad paths
-- ---------------------------------------------------------------------------

create or replace function public.submit_candidate_application(
  p_vacancy_id uuid,
  p_first_name text,
  p_last_name text default null,
  p_phone text default null,
  p_age integer default null,
  p_city text default null,
  p_experience text default null,
  p_previous_work text default null,
  p_expected_salary text default null,
  p_available_from text default null,
  p_about text default null,
  p_photo_url text default null,
  p_photo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vacancy public.academy_vacancies%rowtype;
  v_first text;
  v_last text;
  v_phone text;
  v_id uuid;
  v_path text;
begin
  if p_vacancy_id is null then
    raise exception 'vacancy_required' using errcode = 'P0001';
  end if;

  select * into v_vacancy
  from public.academy_vacancies
  where id = p_vacancy_id;

  if not found then
    raise exception 'vacancy_not_found' using errcode = 'P0001';
  end if;

  if v_vacancy.status is distinct from 'published' then
    raise exception 'vacancy_closed' using errcode = 'P0001';
  end if;

  v_first := nullif(btrim(coalesce(p_first_name, '')), '');
  v_last := coalesce(btrim(coalesce(p_last_name, '')), '');
  v_phone := nullif(btrim(coalesce(p_phone, '')), '');

  if v_first is null then
    raise exception 'first_name_required' using errcode = 'P0001';
  end if;

  if v_phone is null then
    raise exception 'phone_required' using errcode = 'P0001';
  end if;

  if p_age is not null and (p_age < 14 or p_age > 100) then
    raise exception 'age_invalid' using errcode = 'P0001';
  end if;

  -- Ignore client-supplied public/permanent photo URLs; path only.
  -- Path must match the anon INSERT policy (applications/{uuid}.{ext}).
  v_path := nullif(btrim(coalesce(p_photo_path, '')), '');
  if v_path is not null then
    if char_length(v_path) > 500
      or v_path like '%..%'
      or v_path !~* '^applications/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp)$'
    then
      raise exception 'photo_invalid' using errcode = 'P0001';
    end if;
  end if;

  insert into public.academy_candidates (
    vacancy_id,
    first_name,
    last_name,
    full_name,
    phone,
    age,
    city,
    experience,
    previous_work,
    expected_salary,
    available_from,
    about,
    answers,
    photo_url,
    photo_path,
    score_percent,
    total_score,
    max_score,
    status
  ) values (
    p_vacancy_id,
    v_first,
    v_last,
    btrim(v_first || ' ' || v_last),
    v_phone,
    p_age,
    nullif(btrim(coalesce(p_city, '')), ''),
    nullif(btrim(coalesce(p_experience, '')), ''),
    nullif(btrim(coalesce(p_previous_work, '')), ''),
    nullif(btrim(coalesce(p_expected_salary, '')), ''),
    nullif(btrim(coalesce(p_available_from, '')), ''),
    nullif(btrim(coalesce(p_about, '')), ''),
    '{}'::jsonb,
    null,
    v_path,
    0,
    0,
    0,
    'new'
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'candidate_id', v_id,
    'message', 'Анкета успешно отправлена. Мы свяжемся с вами после рассмотрения.'
  );
end;
$$;

comment on function public.submit_candidate_application(
  uuid, text, text, text, integer, text, text, text, text, text, text, text, text
) is
  'Public candidate apply. Whitelisted fields; status=new; photo_path only (private bucket).';

revoke all on function public.submit_candidate_application(
  uuid, text, text, text, integer, text, text, text, text, text, text, text, text
) from public;

grant execute on function public.submit_candidate_application(
  uuid, text, text, text, integer, text, text, text, text, text, text, text, text
) to anon, authenticated, service_role;
