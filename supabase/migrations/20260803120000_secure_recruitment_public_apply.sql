-- Stage 2 HR: schema drift sync, false-reject repair, secure public apply RPC + RLS.
-- Idempotent. Does not drop academy_candidate_questions or score columns.

select pg_advisory_xact_lock(202608031200);

create schema if not exists auth_private;

-- Ensure permission helper exists (same definition as employee_documents migration).
create or replace function auth_private.current_user_has_permission(p_permission_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and (
      exists (
        select 1
        from public.academy_users au
        join public.role_permissions rp on rp.role_id = au.role_id
        join public.permissions p on p.id = rp.permission_id
        where au.auth_user_id = auth.uid()
          and au.status = 'active'
          and p.code = p_permission_code
      )
      or exists (
        select 1
        from public.academy_users au
        where au.auth_user_id = auth.uid()
          and au.status = 'active'
          and au.role = 'admin'
      )
    );
$$;

revoke all on function auth_private.current_user_has_permission(text) from public;
revoke all on function auth_private.current_user_has_permission(text) from anon;
grant execute on function auth_private.current_user_has_permission(text) to authenticated;
grant execute on function auth_private.current_user_has_permission(text) to service_role;

-- ---------------------------------------------------------------------------
-- 1) Schema drift: employee_role on vacancies
-- ---------------------------------------------------------------------------

alter table public.academy_vacancies
  add column if not exists employee_role text;

update public.academy_vacancies
set employee_role = role
where employee_role is null
  and role is not null;

-- ---------------------------------------------------------------------------
-- 2) Schema drift: candidate status CHECK
-- ---------------------------------------------------------------------------

do $$
declare
  v_unknown int;
begin
  select count(*)::int into v_unknown
  from public.academy_candidates
  where status is not null
    and status not in (
      'new', 'suitable', 'questionable', 'maybe', 'rejected', 'invited',
      'interview_passed', 'intern', 'trainee', 'hired'
    );

  if v_unknown > 0 then
    raise exception
      'secure_recruitment_public_apply: % candidates have unsupported status values',
      v_unknown;
  end if;
end $$;

alter table public.academy_candidates
  drop constraint if exists academy_candidates_status_check;

alter table public.academy_candidates
  add constraint academy_candidates_status_check
  check (status in (
    'new', 'suitable', 'questionable', 'maybe', 'rejected', 'invited',
    'interview_passed', 'intern', 'trainee', 'hired'
  ));

-- ---------------------------------------------------------------------------
-- 3) Repair auto-rejected no-test candidates (idempotent)
-- Criteria: rejected + max_score=0 + vacancy has zero questions + not hired.
-- Residual risk: a manual reject of a no-test candidate would also match.
-- ---------------------------------------------------------------------------

update public.academy_candidates c
set
  status = 'new',
  updated_at = now()
where c.status = 'rejected'
  and coalesce(c.max_score, 0) = 0
  and c.created_user_id is null
  and c.vacancy_id is not null
  and not exists (
    select 1
    from public.academy_candidate_questions q
    where q.vacancy_id = c.vacancy_id
  );

-- ---------------------------------------------------------------------------
-- 4) Public submit RPC (whitelist fields, always status=new)
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

  if p_photo_url is not null and char_length(p_photo_url) > 2000 then
    raise exception 'photo_invalid' using errcode = 'P0001';
  end if;

  if p_photo_path is not null and (
    char_length(p_photo_path) > 500
    or p_photo_path like '%..%'
    or position('/' in p_photo_path) = 0
  ) then
    raise exception 'photo_invalid' using errcode = 'P0001';
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
    nullif(btrim(coalesce(p_photo_url, '')), ''),
    nullif(btrim(coalesce(p_photo_path, '')), ''),
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
  'Public candidate apply. Whitelisted fields only; always inserts status=new. Bypasses table RLS.';

revoke all on function public.submit_candidate_application(
  uuid, text, text, text, integer, text, text, text, text, text, text, text, text
) from public;

grant execute on function public.submit_candidate_application(
  uuid, text, text, text, integer, text, text, text, text, text, text, text, text
) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) RLS: vacancies
-- ---------------------------------------------------------------------------

alter table public.academy_vacancies enable row level security;

drop policy if exists "Allow anon read write academy_vacancies" on public.academy_vacancies;
drop policy if exists academy_vacancies_anon_select_published on public.academy_vacancies;
drop policy if exists academy_vacancies_hr_select on public.academy_vacancies;
drop policy if exists academy_vacancies_hr_insert on public.academy_vacancies;
drop policy if exists academy_vacancies_hr_update on public.academy_vacancies;
drop policy if exists academy_vacancies_hr_delete on public.academy_vacancies;

revoke all on table public.academy_vacancies from anon;
revoke all on table public.academy_vacancies from authenticated;
grant select on table public.academy_vacancies to anon;
grant select, insert, update, delete on table public.academy_vacancies to authenticated;
grant all on table public.academy_vacancies to service_role;

create policy academy_vacancies_anon_select_published
  on public.academy_vacancies
  for select
  to anon
  using (status = 'published');

create policy academy_vacancies_hr_select
  on public.academy_vacancies
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('recruitment.view')
    or auth_private.current_user_has_permission('recruitment.manage_vacancies')
    or auth_private.current_user_has_permission('recruitment.manage_candidates')
  );

create policy academy_vacancies_hr_insert
  on public.academy_vacancies
  for insert
  to authenticated
  with check (auth_private.current_user_has_permission('recruitment.manage_vacancies'));

create policy academy_vacancies_hr_update
  on public.academy_vacancies
  for update
  to authenticated
  using (auth_private.current_user_has_permission('recruitment.manage_vacancies'))
  with check (auth_private.current_user_has_permission('recruitment.manage_vacancies'));

create policy academy_vacancies_hr_delete
  on public.academy_vacancies
  for delete
  to authenticated
  using (auth_private.current_user_has_permission('recruitment.manage_vacancies'));

-- ---------------------------------------------------------------------------
-- 6) RLS: candidate questions (read published only for anon; no scored UI writes needed for anon)
-- ---------------------------------------------------------------------------

alter table public.academy_candidate_questions enable row level security;

drop policy if exists "Allow anon read write academy_candidate_questions"
  on public.academy_candidate_questions;
drop policy if exists academy_candidate_questions_anon_select_published
  on public.academy_candidate_questions;
drop policy if exists academy_candidate_questions_hr_select
  on public.academy_candidate_questions;
drop policy if exists academy_candidate_questions_hr_write
  on public.academy_candidate_questions;
drop policy if exists academy_candidate_questions_hr_update
  on public.academy_candidate_questions;
drop policy if exists academy_candidate_questions_hr_delete
  on public.academy_candidate_questions;

revoke all on table public.academy_candidate_questions from anon;
revoke all on table public.academy_candidate_questions from authenticated;
grant select on table public.academy_candidate_questions to anon;
grant select, insert, update, delete on table public.academy_candidate_questions to authenticated;
grant all on table public.academy_candidate_questions to service_role;

create policy academy_candidate_questions_anon_select_published
  on public.academy_candidate_questions
  for select
  to anon
  using (
    exists (
      select 1
      from public.academy_vacancies v
      where v.id = academy_candidate_questions.vacancy_id
        and v.status = 'published'
    )
  );

create policy academy_candidate_questions_hr_select
  on public.academy_candidate_questions
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('recruitment.view')
    or auth_private.current_user_has_permission('recruitment.manage_vacancies')
    or auth_private.current_user_has_permission('recruitment.manage_candidates')
  );

create policy academy_candidate_questions_hr_write
  on public.academy_candidate_questions
  for insert
  to authenticated
  with check (auth_private.current_user_has_permission('recruitment.manage_vacancies'));

create policy academy_candidate_questions_hr_update
  on public.academy_candidate_questions
  for update
  to authenticated
  using (auth_private.current_user_has_permission('recruitment.manage_vacancies'))
  with check (auth_private.current_user_has_permission('recruitment.manage_vacancies'));

create policy academy_candidate_questions_hr_delete
  on public.academy_candidate_questions
  for delete
  to authenticated
  using (auth_private.current_user_has_permission('recruitment.manage_vacancies'));

-- ---------------------------------------------------------------------------
-- 7) RLS: candidates — no anon table access; HR via permissions
-- ---------------------------------------------------------------------------

alter table public.academy_candidates enable row level security;

drop policy if exists "Allow anon read write academy_candidates" on public.academy_candidates;
drop policy if exists academy_candidates_hr_select on public.academy_candidates;
drop policy if exists academy_candidates_hr_insert on public.academy_candidates;
drop policy if exists academy_candidates_hr_update on public.academy_candidates;
drop policy if exists academy_candidates_hr_delete on public.academy_candidates;

revoke all on table public.academy_candidates from anon;
revoke all on table public.academy_candidates from authenticated;
grant select, insert, update, delete on table public.academy_candidates to authenticated;
grant all on table public.academy_candidates to service_role;

create policy academy_candidates_hr_select
  on public.academy_candidates
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('recruitment.view')
    or auth_private.current_user_has_permission('recruitment.manage_candidates')
  );

create policy academy_candidates_hr_insert
  on public.academy_candidates
  for insert
  to authenticated
  with check (auth_private.current_user_has_permission('recruitment.manage_candidates'));

create policy academy_candidates_hr_update
  on public.academy_candidates
  for update
  to authenticated
  using (
    auth_private.current_user_has_permission('recruitment.manage_candidates')
    or auth_private.current_user_has_permission('recruitment.invite_candidate')
    or auth_private.current_user_has_permission('recruitment.hire_candidate')
  )
  with check (
    auth_private.current_user_has_permission('recruitment.manage_candidates')
    or auth_private.current_user_has_permission('recruitment.invite_candidate')
    or auth_private.current_user_has_permission('recruitment.hire_candidate')
  );

create policy academy_candidates_hr_delete
  on public.academy_candidates
  for delete
  to authenticated
  using (auth_private.current_user_has_permission('recruitment.manage_candidates'));

-- ---------------------------------------------------------------------------
-- 8) Storage candidate-photos: keep public URL read; block anon update/delete
-- ---------------------------------------------------------------------------

drop policy if exists "Public read candidate photos" on storage.objects;
drop policy if exists "Anon upload candidate photos" on storage.objects;
drop policy if exists candidate_photos_anon_insert on storage.objects;
drop policy if exists candidate_photos_anon_select on storage.objects;
drop policy if exists candidate_photos_authenticated_select on storage.objects;

-- Public bucket URLs remain readable via CDN when bucket.public = true.
-- API listing/select for anon is intentionally not granted beyond path-scoped select
-- used by some clients; prefer authenticated HR select.

create policy candidate_photos_anon_insert
  on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'candidate-photos'
    and (storage.foldername(name))[1] is not null
    and name not like '%..%'
  );

create policy candidate_photos_authenticated_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'candidate-photos'
    and (
      auth_private.current_user_has_permission('recruitment.view')
      or auth_private.current_user_has_permission('recruitment.manage_candidates')
    )
  );
