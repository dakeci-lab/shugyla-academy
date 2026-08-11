-- Public careers vacancy facts on the existing academy_vacancies model.
-- Nullable for backward compatibility. Does not change table grants or RLS.

begin;

select pg_advisory_xact_lock(202608112109);

alter table public.academy_vacancies
  add column if not exists city text,
  add column if not exists store_name text,
  add column if not exists store_address text,
  add column if not exists salary_from integer,
  add column if not exists salary_to integer,
  add column if not exists salary_note text,
  add column if not exists schedule text,
  add column if not exists employment_type text,
  add column if not exists experience_requirement text;

alter table public.academy_vacancies
  drop constraint if exists academy_vacancies_city_check,
  drop constraint if exists academy_vacancies_store_name_check,
  drop constraint if exists academy_vacancies_store_address_check,
  drop constraint if exists academy_vacancies_salary_from_check,
  drop constraint if exists academy_vacancies_salary_to_check,
  drop constraint if exists academy_vacancies_salary_range_check,
  drop constraint if exists academy_vacancies_salary_note_check,
  drop constraint if exists academy_vacancies_schedule_check,
  drop constraint if exists academy_vacancies_employment_type_check,
  drop constraint if exists academy_vacancies_experience_requirement_check;

alter table public.academy_vacancies
  add constraint academy_vacancies_city_check
    check (city is null or char_length(btrim(city)) between 1 and 120),
  add constraint academy_vacancies_store_name_check
    check (store_name is null or char_length(btrim(store_name)) between 1 and 160),
  add constraint academy_vacancies_store_address_check
    check (store_address is null or char_length(btrim(store_address)) between 1 and 500),
  add constraint academy_vacancies_salary_from_check
    check (salary_from is null or salary_from >= 0),
  add constraint academy_vacancies_salary_to_check
    check (salary_to is null or salary_to >= 0),
  add constraint academy_vacancies_salary_range_check
    check (salary_from is null or salary_to is null or salary_to >= salary_from),
  add constraint academy_vacancies_salary_note_check
    check (salary_note is null or char_length(btrim(salary_note)) between 1 and 300),
  add constraint academy_vacancies_schedule_check
    check (schedule is null or char_length(btrim(schedule)) between 1 and 300),
  add constraint academy_vacancies_employment_type_check
    check (
      employment_type is null
      or employment_type in ('full_time', 'part_time', 'temporary', 'internship', 'contract')
    ),
  add constraint academy_vacancies_experience_requirement_check
    check (
      experience_requirement is null
      or experience_requirement in ('not_required', 'preferred', 'required')
    );

comment on column public.academy_vacancies.city is 'Public vacancy city.';
comment on column public.academy_vacancies.store_name is 'Public store/location name.';
comment on column public.academy_vacancies.store_address is 'Public store address.';
comment on column public.academy_vacancies.salary_from is 'Minimum monthly salary in KZT.';
comment on column public.academy_vacancies.salary_to is 'Maximum monthly salary in KZT.';
comment on column public.academy_vacancies.salary_note is 'Optional public salary clarification.';
comment on column public.academy_vacancies.schedule is 'Public work schedule.';
comment on column public.academy_vacancies.employment_type is 'Constrained public employment type.';
comment on column public.academy_vacancies.experience_requirement is
  'Constrained public experience requirement.';

-- RETURNS TABLE changed, so PostgreSQL requires drop + recreate.
drop function if exists public.list_published_vacancies_for_apply();

create function public.list_published_vacancies_for_apply()
returns table (
  id uuid,
  title text,
  slug text,
  description text,
  position_name text,
  city text,
  store_name text,
  store_address text,
  salary_from integer,
  salary_to integer,
  salary_note text,
  schedule text,
  employment_type text,
  experience_requirement text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id,
    v.title,
    v.slug,
    nullif(btrim(coalesce(v.description, '')), '') as description,
    coalesce(nullif(btrim(p.name), ''), nullif(btrim(v.position_name_snapshot), '')) as position_name,
    nullif(btrim(coalesce(v.city, '')), '') as city,
    nullif(btrim(coalesce(v.store_name, '')), '') as store_name,
    nullif(btrim(coalesce(v.store_address, '')), '') as store_address,
    v.salary_from,
    v.salary_to,
    nullif(btrim(coalesce(v.salary_note, '')), '') as salary_note,
    nullif(btrim(coalesce(v.schedule, '')), '') as schedule,
    v.employment_type,
    v.experience_requirement,
    v.created_at
  from public.academy_vacancies v
  inner join public.positions p on p.id = v.position_id
  where v.status = 'published'
    and v.position_id is not null
    and nullif(btrim(v.slug), '') is not null
    and p.is_active = true
    and p.archived_at is null
  order by v.created_at desc nulls last, v.title asc;
$$;

comment on function public.list_published_vacancies_for_apply() is
  'Public careers list: published vacancies with active positions and whitelisted facts only.';

revoke all on function public.list_published_vacancies_for_apply() from public;
grant execute on function public.list_published_vacancies_for_apply()
  to anon, authenticated, service_role;

-- Keep the existing public form contract and add only whitelisted vacancy facts.
create or replace function public.get_public_vacancy_application_form(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_vacancy public.academy_vacancies%rowtype;
  v_questions jsonb;
begin
  if nullif(btrim(coalesce(p_slug, '')), '') is null then
    raise exception 'vacancy_not_found' using errcode = 'P0001';
  end if;

  select v.* into v_vacancy
  from public.academy_vacancies v
  inner join public.positions p on p.id = v.position_id
  where v.slug = btrim(p_slug)
    and v.status = 'published'
    and v.position_id is not null
    and p.is_active = true
    and p.archived_at is null;

  if not found then
    raise exception 'vacancy_not_found' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'label', q.question_text,
      'question_type', q.question_type,
      'required', q.required,
      'sort_order', q.sort_order,
      'help_text', q.help_text,
      'placeholder', q.placeholder,
      'options', case
        when q.question_type in ('single_choice', 'multi_choice')
          then public.application_form_normalize_options(q.options)
        else '[]'::jsonb
      end
    )
    order by q.sort_order asc, q.created_at asc
  ), '[]'::jsonb)
  into v_questions
  from public.academy_candidate_questions q
  where q.vacancy_id = v_vacancy.id
    and q.is_active = true;

  return jsonb_build_object(
    'vacancy', jsonb_build_object(
      'id', v_vacancy.id,
      'title', v_vacancy.title,
      'slug', v_vacancy.slug,
      'description', nullif(btrim(coalesce(v_vacancy.description, '')), ''),
      'position_name', coalesce(
        (select nullif(btrim(p.name), '') from public.positions p where p.id = v_vacancy.position_id),
        nullif(btrim(coalesce(v_vacancy.position_name_snapshot, '')), '')
      ),
      'city', nullif(btrim(coalesce(v_vacancy.city, '')), ''),
      'store_name', nullif(btrim(coalesce(v_vacancy.store_name, '')), ''),
      'store_address', nullif(btrim(coalesce(v_vacancy.store_address, '')), ''),
      'salary_from', v_vacancy.salary_from,
      'salary_to', v_vacancy.salary_to,
      'salary_note', nullif(btrim(coalesce(v_vacancy.salary_note, '')), ''),
      'schedule', nullif(btrim(coalesce(v_vacancy.schedule, '')), ''),
      'employment_type', v_vacancy.employment_type,
      'experience_requirement', v_vacancy.experience_requirement
    ),
    'form_version', coalesce(v_vacancy.application_form_version, 1),
    'questions', v_questions
  );
end;
$$;

revoke all on function public.get_public_vacancy_application_form(text) from public;
grant execute on function public.get_public_vacancy_application_form(text)
  to anon, authenticated, service_role;

-- Preserve the existing permission-gated duplicate RPC and copy public facts.
create or replace function public.duplicate_vacancy_with_application_form(p_source_vacancy_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.academy_vacancies%rowtype;
  v_new_id uuid := gen_random_uuid();
  v_title text;
  v_slug text;
  v_base_slug text;
  v_counter int := 2;
begin
  if not auth_private.current_user_has_permission('recruitment.manage_vacancies') then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  select * into v_source
  from public.academy_vacancies
  where id = p_source_vacancy_id
  for share;

  if not found then
    raise exception 'vacancy_not_found' using errcode = 'P0001';
  end if;

  if v_source.position_id is null then
    raise exception 'form_invalid:position_required' using errcode = 'P0001';
  end if;

  perform public.validate_vacancy_application_form(p_source_vacancy_id, true);

  v_title := btrim(v_source.title) || ' (копия)';
  v_base_slug := lower(regexp_replace(v_title, '[^a-zA-Zа-яА-Я0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  if v_base_slug = '' then
    v_base_slug := 'vacancy';
  end if;
  v_slug := v_base_slug;
  while exists (select 1 from public.academy_vacancies where slug = v_slug) loop
    v_slug := v_base_slug || '-' || v_counter::text;
    v_counter := v_counter + 1;
    if v_counter > 1000 then
      raise exception 'slug_conflict' using errcode = 'P0001';
    end if;
  end loop;

  perform set_config('recruitment.skip_form_seed', 'on', true);

  insert into public.academy_vacancies (
    id, title, slug, description, role, employee_role, position_id,
    position_name_snapshot, status, passing_score, application_form_version, created_by,
    city, store_name, store_address, salary_from, salary_to, salary_note,
    schedule, employment_type, experience_requirement
  ) values (
    v_new_id,
    v_title,
    v_slug,
    v_source.description,
    v_source.role,
    v_source.employee_role,
    v_source.position_id,
    v_source.position_name_snapshot,
    'draft',
    coalesce(v_source.passing_score, 80),
    1,
    v_source.created_by,
    v_source.city,
    v_source.store_name,
    v_source.store_address,
    v_source.salary_from,
    v_source.salary_to,
    v_source.salary_note,
    v_source.schedule,
    v_source.employment_type,
    v_source.experience_requirement
  );

  insert into public.academy_candidate_questions (
    vacancy_id, question_text, question_type, options, scores, required,
    sort_order, is_active, field_binding, help_text, placeholder
  )
  select
    v_new_id,
    q.question_text,
    q.question_type,
    public.application_form_normalize_options(q.options),
    '[]'::jsonb,
    q.required,
    q.sort_order,
    q.is_active,
    q.field_binding,
    q.help_text,
    q.placeholder
  from public.academy_candidate_questions q
  where q.vacancy_id = p_source_vacancy_id
    and q.is_active = true
  order by q.sort_order, q.created_at;

  perform public.validate_vacancy_application_form(v_new_id, false);

  return jsonb_build_object(
    'ok', true,
    'vacancy_id', v_new_id,
    'slug', v_slug,
    'title', v_title,
    'status', 'draft',
    'application_form_version', 1
  );
end;
$$;

revoke all on function public.duplicate_vacancy_with_application_form(uuid) from public;
grant execute on function public.duplicate_vacancy_with_application_form(uuid)
  to authenticated, service_role;

commit;
