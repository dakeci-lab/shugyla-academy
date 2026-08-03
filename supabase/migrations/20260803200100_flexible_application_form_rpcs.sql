-- Stage 5 RPCs: public form fetch, HR save, submit with snapshot validation, publish guard.

-- ---------------------------------------------------------------------------
-- Public form
-- ---------------------------------------------------------------------------

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
      )
    ),
    'form_version', coalesce(v_vacancy.application_form_version, 1),
    'questions', v_questions
  );
end;
$$;

comment on function public.get_public_vacancy_application_form(text) is
  'Public apply form: published vacancy + active questions whitelist (no bindings/scores).';

revoke all on function public.get_public_vacancy_application_form(text) from public;
grant execute on function public.get_public_vacancy_application_form(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- HR save form (transactional)
-- ---------------------------------------------------------------------------

create or replace function public.save_vacancy_application_form(
  p_vacancy_id uuid,
  p_questions jsonb,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vacancy public.academy_vacancies%rowtype;
  v_limits jsonb := public.application_form_limits();
  v_item jsonb;
  v_id uuid;
  v_new_id uuid;
  v_type text;
  v_label text;
  v_binding text;
  v_required boolean;
  v_active boolean;
  v_help text;
  v_placeholder text;
  v_options jsonb;
  v_sort int;
  v_kept uuid[] := array[]::uuid[];
  v_existing record;
  v_idx int := 0;
  v_active_count int := 0;
  v_bindings text[] := array[]::text[];
  v_result jsonb;
begin
  if not (
    auth_private.current_user_has_permission('recruitment.manage_vacancies')
  ) then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  select * into v_vacancy from public.academy_vacancies where id = p_vacancy_id for update;
  if not found then
    raise exception 'vacancy_not_found' using errcode = 'P0001';
  end if;

  if p_expected_version is not null
     and coalesce(v_vacancy.application_form_version, 1) is distinct from p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'form_invalid:questions_required' using errcode = 'P0001';
  end if;

  if octet_length(p_questions::text) > (v_limits->>'max_payload_bytes')::int then
    raise exception 'form_invalid:payload_too_large' using errcode = 'P0001';
  end if;

  for v_item in select value from jsonb_array_elements(p_questions)
  loop
    v_idx := v_idx + 1;
    v_label := nullif(btrim(coalesce(v_item->>'question_text', v_item->>'label', '')), '');
    v_type := coalesce(v_item->>'question_type', '');
    v_binding := nullif(btrim(coalesce(v_item->>'field_binding', '')), '');
    v_required := coalesce((v_item->>'required')::boolean, true);
    v_active := coalesce((v_item->>'is_active')::boolean, true);
    v_help := nullif(btrim(coalesce(v_item->>'help_text', '')), '');
    v_placeholder := nullif(btrim(coalesce(v_item->>'placeholder', '')), '');
    v_sort := coalesce((v_item->>'sort_order')::int, v_idx - 1);
    v_options := public.application_form_normalize_options(coalesce(v_item->'options', '[]'::jsonb));

    if v_label is null then
      raise exception 'form_invalid:empty_label' using errcode = 'P0001';
    end if;
    if char_length(v_label) > (v_limits->>'max_label_length')::int then
      raise exception 'form_invalid:label_too_long' using errcode = 'P0001';
    end if;
    if v_help is not null and char_length(v_help) > (v_limits->>'max_help_text_length')::int then
      raise exception 'form_invalid:help_too_long' using errcode = 'P0001';
    end if;
    if v_placeholder is not null and char_length(v_placeholder) > (v_limits->>'max_placeholder_length')::int then
      raise exception 'form_invalid:placeholder_too_long' using errcode = 'P0001';
    end if;
    if v_type not in (
      'short_text','long_text','phone','number','date',
      'single_choice','multi_choice','yes_no','photo'
    ) then
      raise exception 'form_invalid:unknown_type' using errcode = 'P0001';
    end if;

    if v_binding is not null then
      if v_binding not in (
        'first_name','last_name','phone','age','city','experience',
        'previous_work','expected_salary','available_from','about','photo'
      ) then
        raise exception 'form_invalid:bad_binding' using errcode = 'P0001';
      end if;
      if v_binding = any(v_bindings) and v_active then
        raise exception 'form_invalid:duplicate_binding' using errcode = 'P0001';
      end if;
      if v_active then
        v_bindings := array_append(v_bindings, v_binding);
      end if;
      if v_binding in ('first_name','phone') then
        v_required := true;
        v_active := true;
        if v_binding = 'first_name' and v_type <> 'short_text' then
          raise exception 'form_invalid:protected_type' using errcode = 'P0001';
        end if;
        if v_binding = 'phone' and v_type not in ('phone','short_text') then
          raise exception 'form_invalid:protected_type' using errcode = 'P0001';
        end if;
      end if;
    end if;

    if v_type in ('single_choice','multi_choice') then
      if jsonb_array_length(v_options) < 2 then
        raise exception 'form_invalid:options_required' using errcode = 'P0001';
      end if;
      if jsonb_array_length(v_options) > (v_limits->>'max_options')::int then
        raise exception 'form_invalid:too_many_options' using errcode = 'P0001';
      end if;
    else
      v_options := '[]'::jsonb;
    end if;

    if v_active then
      v_active_count := v_active_count + 1;
    end if;

    v_id := null;
    begin
      v_id := nullif(v_item->>'id', '')::uuid;
    exception when others then
      v_id := null;
    end;

    if v_id is not null then
      select * into v_existing
      from public.academy_candidate_questions
      where id = v_id and vacancy_id = p_vacancy_id;

      if not found then
        raise exception 'form_invalid:unknown_question' using errcode = 'P0001';
      end if;

      -- Protect system bindings from rebinding/deactivation.
      if v_existing.field_binding in ('first_name','phone') then
        v_binding := v_existing.field_binding;
        v_required := true;
        v_active := true;
        if v_binding = 'first_name' then v_type := 'short_text'; end if;
        if v_binding = 'phone' and v_type not in ('phone','short_text') then
          v_type := 'phone';
        end if;
      elsif v_existing.field_binding is not null and v_binding is distinct from v_existing.field_binding then
        -- Do not allow changing an existing binding via client.
        v_binding := v_existing.field_binding;
      end if;

      update public.academy_candidate_questions set
        question_text = v_label,
        question_type = v_type,
        options = v_options,
        scores = '[]'::jsonb,
        required = v_required,
        sort_order = v_sort,
        is_active = v_active,
        field_binding = v_binding,
        help_text = v_help,
        placeholder = v_placeholder,
        updated_at = now()
      where id = v_id;

      v_kept := array_append(v_kept, v_id);
    else
      if v_binding in ('first_name','phone') then
        -- Creating new protected rows only via seed; block duplicates.
        if exists (
          select 1 from public.academy_candidate_questions
          where vacancy_id = p_vacancy_id and field_binding = v_binding and is_active
        ) then
          raise exception 'form_invalid:duplicate_binding' using errcode = 'P0001';
        end if;
      end if;

      v_new_id := gen_random_uuid();
      insert into public.academy_candidate_questions (
        id, vacancy_id, question_text, question_type, options, scores,
        required, sort_order, is_active, field_binding, help_text, placeholder
      ) values (
        v_new_id, p_vacancy_id, v_label, v_type, v_options, '[]'::jsonb,
        v_required, v_sort, v_active, v_binding, v_help, v_placeholder
      );
      v_kept := array_append(v_kept, v_new_id);
    end if;
  end loop;

  if v_active_count > (v_limits->>'max_active_questions')::int then
    raise exception 'form_invalid:too_many_questions' using errcode = 'P0001';
  end if;

  -- Soft/hard delete removed questions.
  for v_existing in
    select * from public.academy_candidate_questions
    where vacancy_id = p_vacancy_id
      and not (id = any(v_kept))
  loop
    if v_existing.field_binding in ('first_name','phone') then
      raise exception 'form_invalid:protected_delete' using errcode = 'P0001';
    end if;
    if public.application_form_question_used(p_vacancy_id, v_existing.id) then
      update public.academy_candidate_questions
      set is_active = false, updated_at = now()
      where id = v_existing.id;
    else
      delete from public.academy_candidate_questions where id = v_existing.id;
    end if;
  end loop;

  perform public.validate_vacancy_application_form(p_vacancy_id);

  update public.academy_vacancies
  set application_form_version = coalesce(application_form_version, 1) + 1,
      updated_at = now()
  where id = p_vacancy_id
  returning application_form_version into v_idx;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'question_text', q.question_text,
      'question_type', q.question_type,
      'required', q.required,
      'sort_order', q.sort_order,
      'is_active', q.is_active,
      'field_binding', q.field_binding,
      'help_text', q.help_text,
      'placeholder', q.placeholder,
      'options', public.application_form_normalize_options(q.options)
    )
    order by q.sort_order, q.created_at
  ), '[]'::jsonb)
  into v_result
  from public.academy_candidate_questions q
  where q.vacancy_id = p_vacancy_id;

  return jsonb_build_object(
    'ok', true,
    'form_version', v_idx,
    'questions', v_result
  );
end;
$$;

revoke all on function public.save_vacancy_application_form(uuid, jsonb, integer) from public;
grant execute on function public.save_vacancy_application_form(uuid, jsonb, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Publish guard
-- ---------------------------------------------------------------------------

create or replace function public.academy_vacancies_validate_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    perform public.seed_vacancy_application_form(new.id, false);
    perform public.validate_vacancy_application_form(new.id, true);
  end if;
  return new;
end;
$$;

drop trigger if exists academy_vacancies_validate_publish_trg on public.academy_vacancies;
create trigger academy_vacancies_validate_publish_trg
  before insert or update of status on public.academy_vacancies
  for each row
  execute function public.academy_vacancies_validate_publish();

-- Seed minimal form when vacancy is created.
create or replace function public.academy_vacancies_seed_form_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_vacancy_application_form(new.id, false);
  return new;
end;
$$;

drop trigger if exists academy_vacancies_seed_form_on_insert_trg on public.academy_vacancies;
create trigger academy_vacancies_seed_form_on_insert_trg
  after insert on public.academy_vacancies
  for each row
  execute function public.academy_vacancies_seed_form_on_insert();

-- ---------------------------------------------------------------------------
-- Submit with answers snapshot
-- ---------------------------------------------------------------------------

drop function if exists public.submit_candidate_application(
  uuid, text, text, text, integer, text, text, text, text, text, text, text, text
);

create or replace function public.submit_candidate_application(
  p_vacancy_id uuid,
  p_answers jsonb,
  p_form_version integer,
  p_photo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vacancy public.academy_vacancies%rowtype;
  v_limits jsonb := public.application_form_limits();
  v_q record;
  v_raw jsonb;
  v_value jsonb;
  v_text text;
  v_num numeric;
  v_bool boolean;
  v_arr jsonb;
  v_opt_ids text[];
  v_selected text;
  v_display text;
  v_items jsonb := '[]'::jsonb;
  v_path text;
  v_first text;
  v_last text := '';
  v_phone text;
  v_age integer;
  v_city text;
  v_experience text;
  v_previous_work text;
  v_expected_salary text;
  v_available_from text;
  v_about text;
  v_id uuid;
  v_answer_map jsonb;
  v_payload_size int;
  v_known int := 0;
begin
  if p_vacancy_id is null then
    raise exception 'vacancy_required' using errcode = 'P0001';
  end if;

  select v.* into v_vacancy
  from public.academy_vacancies v
  inner join public.positions p on p.id = v.position_id
  where v.id = p_vacancy_id
    and v.status = 'published'
    and p.is_active = true
    and p.archived_at is null;

  if not found then
    raise exception 'vacancy_closed' using errcode = 'P0001';
  end if;

  if p_form_version is null
     or p_form_version is distinct from coalesce(v_vacancy.application_form_version, 1) then
    raise exception 'form_outdated' using errcode = 'P0001';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'answer_invalid' using errcode = 'P0001';
  end if;

  v_payload_size := octet_length(p_answers::text);
  if v_payload_size > (v_limits->>'max_payload_bytes')::int then
    raise exception 'answer_invalid' using errcode = 'P0001';
  end if;

  -- Accept { "answers": { id: value } } or flat map of question id -> value.
  if p_answers ? 'answers' and jsonb_typeof(p_answers->'answers') = 'object' then
    v_answer_map := p_answers->'answers';
  else
    v_answer_map := p_answers;
  end if;

  -- Reject unknown question ids.
  select count(*)::int into v_known
  from jsonb_object_keys(v_answer_map) k
  where not exists (
    select 1 from public.academy_candidate_questions q
    where q.vacancy_id = p_vacancy_id and q.is_active and q.id::text = k
  );
  if v_known > 0 then
    raise exception 'unknown_question' using errcode = 'P0001';
  end if;

  v_path := nullif(btrim(coalesce(p_photo_path, '')), '');
  if v_path is not null then
    if char_length(v_path) > 500
      or v_path like '%..%'
      or v_path !~* '^applications/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp)$'
    then
      raise exception 'photo_invalid' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'candidate-photos' and o.name = v_path
    ) then
      raise exception 'photo_invalid' using errcode = 'P0001';
    end if;
  end if;

  for v_q in
    select *
    from public.academy_candidate_questions q
    where q.vacancy_id = p_vacancy_id and q.is_active = true
    order by q.sort_order, q.created_at
  loop
    v_raw := v_answer_map -> v_q.id::text;
    v_display := null;
    v_value := null;

    if v_q.question_type = 'photo' then
      if v_q.required and v_path is null then
        raise exception 'photo_required' using errcode = 'P0001';
      end if;
      v_value := to_jsonb(v_path is not null);
      v_display := case when v_path is not null then 'Фото загружено' else null end;
    elsif v_q.question_type = 'yes_no' then
      if v_raw is null or v_raw = 'null'::jsonb then
        if v_q.required then raise exception 'answer_required' using errcode = 'P0001'; end if;
      else
        if jsonb_typeof(v_raw) = 'boolean' then
          v_bool := (v_raw #>> '{}')::boolean;
        else
          v_text := lower(btrim(v_raw #>> '{}'));
          if v_text in ('true','yes','да','1') then v_bool := true;
          elsif v_text in ('false','no','нет','0') then v_bool := false;
          else raise exception 'answer_invalid' using errcode = 'P0001';
          end if;
        end if;
        v_value := to_jsonb(v_bool);
        v_display := case when v_bool then 'Да' else 'Нет' end;
      end if;
    elsif v_q.question_type = 'multi_choice' then
      if v_raw is null or v_raw = 'null'::jsonb or (jsonb_typeof(v_raw) = 'array' and jsonb_array_length(v_raw) = 0) then
        if v_q.required then raise exception 'answer_required' using errcode = 'P0001'; end if;
      else
        if jsonb_typeof(v_raw) <> 'array' then
          raise exception 'answer_invalid' using errcode = 'P0001';
        end if;
        select array_agg(o->>'id') into v_opt_ids
        from jsonb_array_elements(public.application_form_normalize_options(v_q.options)) o;
        v_arr := '[]'::jsonb;
        v_display := null;
        for v_selected in select jsonb_array_elements_text(v_raw)
        loop
          if not (v_selected = any(coalesce(v_opt_ids, array[]::text[]))) then
            raise exception 'invalid_option' using errcode = 'P0001';
          end if;
          v_arr := v_arr || to_jsonb(v_selected);
          v_text := (
            select o->>'label'
            from jsonb_array_elements(public.application_form_normalize_options(v_q.options)) o
            where o->>'id' = v_selected
            limit 1
          );
          v_display := case when v_display is null then v_text else v_display || ', ' || v_text end;
        end loop;
        v_value := v_arr;
      end if;
    elsif v_q.question_type = 'single_choice' then
      v_text := nullif(btrim(coalesce(v_raw #>> '{}', '')), '');
      if v_text is null then
        if v_q.required then raise exception 'answer_required' using errcode = 'P0001'; end if;
      else
        select array_agg(o->>'id') into v_opt_ids
        from jsonb_array_elements(public.application_form_normalize_options(v_q.options)) o;
        if not (v_text = any(coalesce(v_opt_ids, array[]::text[]))) then
          raise exception 'invalid_option' using errcode = 'P0001';
        end if;
        v_value := to_jsonb(v_text);
        v_display := (
          select o->>'label'
          from jsonb_array_elements(public.application_form_normalize_options(v_q.options)) o
          where o->>'id' = v_text
          limit 1
        );
      end if;
    elsif v_q.question_type = 'number' then
      v_text := nullif(btrim(coalesce(v_raw #>> '{}', '')), '');
      if v_text is null then
        if v_q.required then raise exception 'answer_required' using errcode = 'P0001'; end if;
      else
        begin
          v_num := v_text::numeric;
        exception when others then
          raise exception 'answer_invalid' using errcode = 'P0001';
        end;
        if v_q.field_binding = 'age' and (v_num < 14 or v_num > 100) then
          raise exception 'answer_invalid' using errcode = 'P0001';
        end if;
        v_value := to_jsonb(v_num);
        v_display := v_text;
      end if;
    elsif v_q.question_type = 'date' then
      v_text := nullif(btrim(coalesce(v_raw #>> '{}', '')), '');
      if v_text is null then
        if v_q.required then raise exception 'answer_required' using errcode = 'P0001'; end if;
      else
        if v_text !~ '^\d{4}-\d{2}-\d{2}$' then
          raise exception 'answer_invalid' using errcode = 'P0001';
        end if;
        begin
          perform v_text::date;
        exception when others then
          raise exception 'answer_invalid' using errcode = 'P0001';
        end;
        v_value := to_jsonb(v_text);
        v_display := v_text;
      end if;
    else
      -- short_text, long_text, phone
      v_text := nullif(btrim(coalesce(v_raw #>> '{}', '')), '');
      if v_text is null then
        if v_q.required then raise exception 'answer_required' using errcode = 'P0001'; end if;
      else
        if v_q.question_type = 'long_text' then
          if char_length(v_text) > (v_limits->>'max_long_text_answer_length')::int then
            raise exception 'answer_invalid' using errcode = 'P0001';
          end if;
        elsif char_length(v_text) > (v_limits->>'max_text_answer_length')::int then
          raise exception 'answer_invalid' using errcode = 'P0001';
        end if;
        if v_q.question_type = 'phone' or v_q.field_binding = 'phone' then
          if char_length(v_text) < 6 or char_length(v_text) > 40 then
            raise exception 'answer_invalid' using errcode = 'P0001';
          end if;
        end if;
        v_value := to_jsonb(v_text);
        v_display := v_text;
      end if;
    end if;

    -- Map bindings to columns
    if v_q.field_binding = 'first_name' then v_first := v_text; end if;
    if v_q.field_binding = 'last_name' then v_last := coalesce(v_text, ''); end if;
    if v_q.field_binding = 'phone' then v_phone := v_text; end if;
    if v_q.field_binding = 'age' and v_text is not null then v_age := trunc(v_num)::int; end if;
    if v_q.field_binding = 'city' then v_city := v_text; end if;
    if v_q.field_binding = 'experience' then v_experience := v_text; end if;
    if v_q.field_binding = 'previous_work' then v_previous_work := v_text; end if;
    if v_q.field_binding = 'expected_salary' then v_expected_salary := coalesce(v_text, v_display); end if;
    if v_q.field_binding = 'available_from' then v_available_from := v_text; end if;
    if v_q.field_binding = 'about' then v_about := v_text; end if;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'question_id', v_q.id,
      'label', v_q.question_text,
      'question_type', v_q.question_type,
      'required', v_q.required,
      'sort_order', v_q.sort_order,
      'value', v_value,
      'display_value', v_display,
      'profile_bound', (v_q.field_binding is not null)
    ));
  end loop;

  if nullif(btrim(coalesce(v_first, '')), '') is null then
    raise exception 'answer_required' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(v_phone, '')), '') is null then
    raise exception 'answer_required' using errcode = 'P0001';
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
    btrim(v_first),
    coalesce(btrim(v_last), ''),
    btrim(btrim(v_first) || ' ' || coalesce(btrim(v_last), '')),
    btrim(v_phone),
    v_age,
    nullif(btrim(coalesce(v_city, '')), ''),
    nullif(btrim(coalesce(v_experience, '')), ''),
    nullif(btrim(coalesce(v_previous_work, '')), ''),
    nullif(btrim(coalesce(v_expected_salary, '')), ''),
    nullif(btrim(coalesce(v_available_from, '')), ''),
    nullif(btrim(coalesce(v_about, '')), ''),
    jsonb_build_object(
      'version', 2,
      'form_version', coalesce(v_vacancy.application_form_version, 1),
      'submitted_at', now(),
      'items', v_items
    ),
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

comment on function public.submit_candidate_application(uuid, jsonb, integer, text) is
  'Public apply submit: validates answers against active form, stores snapshot, status=new.';

revoke all on function public.submit_candidate_application(uuid, jsonb, integer, text) from public;
grant execute on function public.submit_candidate_application(uuid, jsonb, integer, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Hide question bindings from anon direct table reads (public uses RPC only).
-- ---------------------------------------------------------------------------

drop policy if exists academy_candidate_questions_anon_select_published
  on public.academy_candidate_questions;

revoke select on table public.academy_candidate_questions from anon;
