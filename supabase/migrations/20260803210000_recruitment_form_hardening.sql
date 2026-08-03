-- Stage 5.1: one-time photo upload sessions + transactional vacancy duplication.
-- Idempotent.

-- ---------------------------------------------------------------------------
-- 1) Upload sessions table
-- ---------------------------------------------------------------------------

create table if not exists public.recruitment_application_uploads (
  id uuid primary key default gen_random_uuid(),
  vacancy_id uuid not null references public.academy_vacancies(id) on delete cascade,
  form_version integer not null,
  storage_path text not null,
  purpose text not null default 'candidate_photo'
    check (purpose = 'candidate_photo'),
  expires_at timestamptz not null,
  used_at timestamptz,
  cancelled_at timestamptz,
  candidate_id uuid references public.academy_candidates(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint recruitment_application_uploads_path_format
    check (
      storage_path ~* '^applications/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp)$'
    )
);

create unique index if not exists recruitment_application_uploads_path_uidx
  on public.recruitment_application_uploads (storage_path);

create index if not exists recruitment_application_uploads_vacancy_idx
  on public.recruitment_application_uploads (vacancy_id, created_at desc);

create index if not exists recruitment_application_uploads_expiry_idx
  on public.recruitment_application_uploads (expires_at)
  where used_at is null and cancelled_at is null;

alter table public.recruitment_application_uploads enable row level security;

revoke all on table public.recruitment_application_uploads from public;
revoke all on table public.recruitment_application_uploads from anon;
revoke all on table public.recruitment_application_uploads from authenticated;
grant all on table public.recruitment_application_uploads to service_role;

-- No anon/authenticated policies: access only via security definer RPCs.

comment on table public.recruitment_application_uploads is
  'One-time public apply photo upload sessions; not a candidate entity.';

-- ---------------------------------------------------------------------------
-- 2) Skip form seed during transactional duplicate
-- ---------------------------------------------------------------------------

create or replace function public.academy_vacancies_seed_form_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('recruitment.skip_form_seed', true) = 'on' then
    return new;
  end if;
  perform public.seed_vacancy_application_form(new.id, false);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Create upload session
-- ---------------------------------------------------------------------------

create or replace function public.create_candidate_photo_upload_session(
  p_vacancy_id uuid,
  p_form_version integer,
  p_extension text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vacancy public.academy_vacancies%rowtype;
  v_ext text;
  v_path text;
  v_id uuid;
  v_expires timestamptz;
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

  v_ext := lower(nullif(btrim(coalesce(p_extension, '')), ''));
  if v_ext in ('jpeg', 'jpg') then
    v_ext := 'jpg';
  elsif v_ext in ('png', 'webp') then
    null;
  else
    raise exception 'photo_invalid' using errcode = 'P0001';
  end if;

  v_id := gen_random_uuid();
  v_path := 'applications/' || gen_random_uuid()::text || '.' || v_ext;
  v_expires := now() + interval '60 minutes';

  insert into public.recruitment_application_uploads (
    id, vacancy_id, form_version, storage_path, purpose, expires_at
  ) values (
    v_id, p_vacancy_id, p_form_version, v_path, 'candidate_photo', v_expires
  );

  return jsonb_build_object(
    'upload_id', v_id,
    'storage_path', v_path,
    'expires_at', v_expires,
    'purpose', 'candidate_photo'
  );
end;
$$;

revoke all on function public.create_candidate_photo_upload_session(uuid, integer, text) from public;
grant execute on function public.create_candidate_photo_upload_session(uuid, integer, text)
  to anon, authenticated, service_role;

create or replace function public.cancel_candidate_photo_upload_session(p_upload_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_upload_id is null then
    return jsonb_build_object('ok', true);
  end if;

  update public.recruitment_application_uploads
  set cancelled_at = coalesce(cancelled_at, now())
  where id = p_upload_id
    and used_at is null;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.cancel_candidate_photo_upload_session(uuid) from public;
grant execute on function public.cancel_candidate_photo_upload_session(uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Replace submit: require upload session instead of arbitrary path
-- ---------------------------------------------------------------------------

drop function if exists public.submit_candidate_application(uuid, jsonb, integer, text);

create or replace function public.submit_candidate_application(
  p_vacancy_id uuid,
  p_answers jsonb,
  p_form_version integer,
  p_photo_upload_id uuid default null
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
  v_upload public.recruitment_application_uploads%rowtype;
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
  v_mime text;
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

  -- Form version first so outdated submit never consumes an upload session.
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

  if p_answers ? 'answers' and jsonb_typeof(p_answers->'answers') = 'object' then
    v_answer_map := p_answers->'answers';
  else
    v_answer_map := p_answers;
  end if;

  select count(*)::int into v_known
  from jsonb_object_keys(v_answer_map) k
  where not exists (
    select 1 from public.academy_candidate_questions q
    where q.vacancy_id = p_vacancy_id and q.is_active and q.id::text = k
  );
  if v_known > 0 then
    raise exception 'unknown_question' using errcode = 'P0001';
  end if;

  v_path := null;
  if p_photo_upload_id is not null then
    select * into v_upload
    from public.recruitment_application_uploads
    where id = p_photo_upload_id
    for update;

    if not found then
      raise exception 'photo_invalid' using errcode = 'P0001';
    end if;
    if v_upload.vacancy_id is distinct from p_vacancy_id then
      raise exception 'photo_invalid' using errcode = 'P0001';
    end if;
    if v_upload.purpose is distinct from 'candidate_photo' then
      raise exception 'photo_invalid' using errcode = 'P0001';
    end if;
    if v_upload.used_at is not null then
      raise exception 'photo_token_used' using errcode = 'P0001';
    end if;
    if v_upload.cancelled_at is not null then
      raise exception 'photo_token_cancelled' using errcode = 'P0001';
    end if;
    if v_upload.expires_at <= now() then
      raise exception 'photo_token_expired' using errcode = 'P0001';
    end if;
    -- Reuse across form bumps is allowed while session is unused/unexpired
    -- and still bound to the same vacancy (checked above).

    v_path := v_upload.storage_path;

    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'candidate-photos' and o.name = v_path
    ) then
      raise exception 'photo_invalid' using errcode = 'P0001';
    end if;

    select o.metadata->>'mimetype', o.metadata->>'size'
    into v_mime, v_text
    from storage.objects o
    where o.bucket_id = 'candidate-photos' and o.name = v_path;

    if v_mime is not null
       and v_mime not in ('image/jpeg', 'image/jpg', 'image/png', 'image/webp') then
      raise exception 'photo_invalid' using errcode = 'P0001';
    end if;
    if v_text is not null and v_text ~ '^\d+$' and v_text::bigint > 5242880 then
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
    v_text := null;
    v_num := null;

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

    if v_q.field_binding = 'first_name' then v_first := v_text; end if;
    if v_q.field_binding = 'last_name' then v_last := coalesce(v_text, ''); end if;
    if v_q.field_binding = 'phone' then v_phone := v_text; end if;
    if v_q.field_binding = 'age' and v_num is not null then v_age := trunc(v_num)::int; end if;
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
    vacancy_id, first_name, last_name, full_name, phone, age, city, experience,
    previous_work, expected_salary, available_from, about, answers,
    photo_url, photo_path, score_percent, total_score, max_score, status
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
    0, 0, 0,
    'new'
  )
  returning id into v_id;

  if p_photo_upload_id is not null then
    update public.recruitment_application_uploads
    set used_at = now(),
        candidate_id = v_id
    where id = p_photo_upload_id
      and used_at is null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'candidate_id', v_id,
    'message', 'Анкета успешно отправлена. Мы свяжемся с вами после рассмотрения.'
  );
end;
$$;

revoke all on function public.submit_candidate_application(uuid, jsonb, integer, uuid) from public;
grant execute on function public.submit_candidate_application(uuid, jsonb, integer, uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Transactional vacancy duplication
-- ---------------------------------------------------------------------------

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
  r record;
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
    position_name_snapshot, status, passing_score, application_form_version, created_by
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
    v_source.created_by
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

  -- Ensure protected bindings exist exactly once after copy.
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

-- ---------------------------------------------------------------------------
-- 6) Expired unused upload diagnostic helper (no auto-delete of objects)
-- ---------------------------------------------------------------------------

create or replace function public.list_expired_unused_application_uploads(p_limit integer default 100)
returns table (
  id uuid,
  vacancy_id uuid,
  storage_path text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    auth_private.current_user_has_permission('recruitment.manage_vacancies')
    or auth_private.current_user_has_permission('recruitment.manage_candidates')
  ) then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  return query
  select u.id, u.vacancy_id, u.storage_path, u.expires_at, u.created_at
  from public.recruitment_application_uploads u
  where u.used_at is null
    and u.expires_at < now()
  order by u.expires_at asc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function public.list_expired_unused_application_uploads(integer) from public;
grant execute on function public.list_expired_unused_application_uploads(integer)
  to authenticated, service_role;
