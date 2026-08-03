-- Stage 5: flexible per-vacancy application forms (no scoring).
-- Idempotent. Extends academy_candidate_questions; seeds defaults; public/HR RPCs.

-- ---------------------------------------------------------------------------
-- 1) Schema
-- ---------------------------------------------------------------------------

alter table public.academy_vacancies
  add column if not exists application_form_version integer not null default 1;

alter table public.academy_candidate_questions
  add column if not exists field_binding text,
  add column if not exists is_active boolean not null default true,
  add column if not exists help_text text,
  add column if not exists placeholder text;

comment on column public.academy_vacancies.application_form_version is
  'Increments when the active application form definition changes.';
comment on column public.academy_candidate_questions.field_binding is
  'Optional whitelist binding to academy_candidates column; never exposed publicly.';

create unique index if not exists academy_candidate_questions_active_binding_uidx
  on public.academy_candidate_questions (vacancy_id, field_binding)
  where field_binding is not null and is_active = true;

-- ---------------------------------------------------------------------------
-- 2) Limits + helpers
-- ---------------------------------------------------------------------------

create or replace function public.application_form_limits()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'max_active_questions', 40,
    'max_label_length', 200,
    'max_help_text_length', 500,
    'max_placeholder_length', 200,
    'max_options', 20,
    'max_option_label_length', 120,
    'max_text_answer_length', 2000,
    'max_long_text_answer_length', 5000,
    'max_payload_bytes', 100000
  );
$$;

create or replace function public.application_form_normalize_options(p_options jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_el jsonb;
  v_label text;
  v_id text;
  i int := 0;
begin
  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    return '[]'::jsonb;
  end if;

  for v_el in select value from jsonb_array_elements(p_options)
  loop
    i := i + 1;
    if jsonb_typeof(v_el) = 'string' then
      v_label := nullif(btrim(v_el #>> '{}'), '');
      v_id := 'opt-' || i::text;
    elsif jsonb_typeof(v_el) = 'object' then
      v_label := nullif(btrim(coalesce(v_el->>'label', v_el->>'text', '')), '');
      v_id := nullif(btrim(coalesce(v_el->>'id', '')), '');
      if v_id is null then
        v_id := 'opt-' || i::text;
      end if;
    else
      continue;
    end if;

    if v_label is null then
      continue;
    end if;

    v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_id, 'label', v_label));
  end loop;

  return v_out;
end;
$$;

create or replace function public.application_form_question_used(p_vacancy_id uuid, p_question_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.academy_candidates c
    where c.vacancy_id = p_vacancy_id
      and (
        c.answers ? p_question_id::text
        or exists (
          select 1
          from jsonb_array_elements(coalesce(c.answers->'items', '[]'::jsonb)) el
          where el->>'question_id' = p_question_id::text
        )
      )
  );
$$;

create or replace function public.validate_vacancy_application_form(
  p_vacancy_id uuid,
  p_require_position boolean default false
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limits jsonb := public.application_form_limits();
  v_active int;
  v_has_name boolean;
  v_has_phone boolean;
  r record;
  v_opts jsonb;
  v_vacancy public.academy_vacancies%rowtype;
  v_pos_ok boolean;
begin
  select * into v_vacancy from public.academy_vacancies where id = p_vacancy_id;
  if not found then
    raise exception 'vacancy_not_found' using errcode = 'P0001';
  end if;

  if p_require_position then
    if v_vacancy.position_id is null then
      raise exception 'form_invalid:position_required' using errcode = 'P0001';
    end if;

    select exists (
      select 1
      from public.positions p
      where p.id = v_vacancy.position_id
        and p.is_active = true
        and p.archived_at is null
    ) into v_pos_ok;

    if not v_pos_ok then
      raise exception 'form_invalid:position_inactive' using errcode = 'P0001';
    end if;
  end if;

  select count(*)::int into v_active
  from public.academy_candidate_questions q
  where q.vacancy_id = p_vacancy_id and q.is_active = true;

  if v_active > (v_limits->>'max_active_questions')::int then
    raise exception 'form_invalid:too_many_questions' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.academy_candidate_questions q
    where q.vacancy_id = p_vacancy_id and q.is_active and q.required
      and q.field_binding = 'first_name'
      and nullif(btrim(q.question_text), '') is not null
      and q.question_type = 'short_text'
  ) into v_has_name;

  select exists (
    select 1 from public.academy_candidate_questions q
    where q.vacancy_id = p_vacancy_id and q.is_active and q.required
      and q.field_binding = 'phone'
      and nullif(btrim(q.question_text), '') is not null
      and q.question_type in ('phone', 'short_text')
  ) into v_has_phone;

  if not v_has_name then
    raise exception 'form_invalid:name_required' using errcode = 'P0001';
  end if;
  if not v_has_phone then
    raise exception 'form_invalid:phone_required' using errcode = 'P0001';
  end if;

  for r in
    select *
    from public.academy_candidate_questions q
    where q.vacancy_id = p_vacancy_id and q.is_active = true
  loop
    if nullif(btrim(r.question_text), '') is null then
      raise exception 'form_invalid:empty_label' using errcode = 'P0001';
    end if;
    if char_length(r.question_text) > (v_limits->>'max_label_length')::int then
      raise exception 'form_invalid:label_too_long' using errcode = 'P0001';
    end if;
    if r.question_type not in (
      'short_text','long_text','phone','number','date',
      'single_choice','multi_choice','yes_no','photo'
    ) then
      raise exception 'form_invalid:unknown_type' using errcode = 'P0001';
    end if;

    if r.field_binding is not null and r.field_binding not in (
      'first_name','last_name','phone','age','city','experience',
      'previous_work','expected_salary','available_from','about','photo'
    ) then
      raise exception 'form_invalid:bad_binding' using errcode = 'P0001';
    end if;

    if r.field_binding in ('first_name','phone') and (not r.required or not r.is_active) then
      raise exception 'form_invalid:protected_binding' using errcode = 'P0001';
    end if;

    if r.question_type in ('single_choice','multi_choice') then
      v_opts := public.application_form_normalize_options(r.options);
      if jsonb_array_length(v_opts) < 2 then
        raise exception 'form_invalid:options_required' using errcode = 'P0001';
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.validate_vacancy_application_form(uuid, boolean) from public;
grant execute on function public.validate_vacancy_application_form(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Seed defaults
-- ---------------------------------------------------------------------------

create or replace function public.seed_vacancy_application_form(
  p_vacancy_id uuid,
  p_full boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has boolean;
begin
  if p_vacancy_id is null then
    return;
  end if;

  select exists (
    select 1
    from public.academy_candidate_questions q
    where q.vacancy_id = p_vacancy_id
      and q.field_binding = 'first_name'
  ) into v_has;

  if v_has then
    return;
  end if;

  insert into public.academy_candidate_questions (
    vacancy_id, question_text, question_type, options, scores, required,
    sort_order, is_active, field_binding, help_text, placeholder
  ) values
    (p_vacancy_id, 'Имя', 'short_text', '[]'::jsonb, '[]'::jsonb, true, 0, true, 'first_name', null, null),
    (p_vacancy_id, 'Телефон', 'phone', '[]'::jsonb, '[]'::jsonb, true, 2, true, 'phone', null, null);

  if p_full then
    insert into public.academy_candidate_questions (
      vacancy_id, question_text, question_type, options, scores, required,
      sort_order, is_active, field_binding, help_text, placeholder
    ) values
      (p_vacancy_id, 'Фамилия', 'short_text', '[]'::jsonb, '[]'::jsonb, false, 1, true, 'last_name', null, null),
      (p_vacancy_id, 'Возраст', 'number', '[]'::jsonb, '[]'::jsonb, false, 3, true, 'age', null, null),
      (
        p_vacancy_id,
        'Ваша фотография',
        'photo',
        '[]'::jsonb,
        '[]'::jsonb,
        false,
        4,
        true,
        'photo',
        'Загрузите фото, чтобы мы могли быстрее узнать вас на собеседовании. JPEG, PNG или WebP, до 5 MB.',
        null
      ),
      (p_vacancy_id, 'Город / район', 'short_text', '[]'::jsonb, '[]'::jsonb, false, 5, true, 'city', null, null),
      (p_vacancy_id, 'Опыт работы', 'short_text', '[]'::jsonb, '[]'::jsonb, false, 6, true, 'experience', null, null),
      (p_vacancy_id, 'Где раньше работал', 'short_text', '[]'::jsonb, '[]'::jsonb, false, 7, true, 'previous_work', null, null),
      (p_vacancy_id, 'Ожидаемая зарплата', 'short_text', '[]'::jsonb, '[]'::jsonb, false, 8, true, 'expected_salary', null, null),
      (p_vacancy_id, 'Когда готов выйти', 'short_text', '[]'::jsonb, '[]'::jsonb, false, 9, true, 'available_from', null, null),
      (p_vacancy_id, 'О себе', 'long_text', '[]'::jsonb, '[]'::jsonb, false, 10, true, 'about', null, null);
  end if;

  update public.academy_vacancies
  set application_form_version = greatest(coalesce(application_form_version, 1), 1),
      updated_at = now()
  where id = p_vacancy_id;
end;
$$;

revoke all on function public.seed_vacancy_application_form(uuid, boolean) from public;
grant execute on function public.seed_vacancy_application_form(uuid, boolean) to authenticated, service_role;

-- Seed full classic form for every existing vacancy lacking first_name binding.
do $$
declare
  r record;
begin
  for r in select id from public.academy_vacancies
  loop
    perform public.seed_vacancy_application_form(r.id, true);
  end loop;
end $$;
