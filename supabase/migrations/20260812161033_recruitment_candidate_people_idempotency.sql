-- Recruitment: candidate duplicate-prevention redesign.
-- Full person + separate applications model (not a bare unique(phone,vacancy) shortcut).
-- Idempotent. Never deletes/rewrites existing academy_candidates rows, statuses, or notes.

select pg_advisory_xact_lock(20260812161033);

-- ---------------------------------------------------------------------------
-- 0) Helpers: advisory-lock key, KZ mobile phone normalizer, status progress rank
-- ---------------------------------------------------------------------------

create or replace function public.recruitment_advisory_key(p_text text)
returns bigint
language sql
immutable
set search_path = pg_catalog
as $$
  select ('x' || substr(md5(coalesce(p_text, '')), 1, 16))::bit(64)::bigint;
$$;

comment on function public.recruitment_advisory_key(text) is
  'Deterministic bigint key for pg_advisory_xact_lock from an arbitrary text key. Used to serialize submit_candidate_application around a person/vacancy or submission key without a SELECT-then-INSERT race.';

revoke all on function public.recruitment_advisory_key(text) from public;
revoke all on function public.recruitment_advisory_key(text) from anon;
revoke all on function public.recruitment_advisory_key(text) from authenticated;

create or replace function public.normalize_kz_mobile_phone(p_input text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_digits text;
begin
  if p_input is null then
    return null;
  end if;

  v_digits := regexp_replace(p_input, '[^0-9]', '', 'g');
  if v_digits = '' then
    return null;
  end if;

  -- Legacy "8 7XX XXX XX XX" -> swap leading 8 for country code 7.
  if length(v_digits) = 11 and left(v_digits, 1) = '8' then
    v_digits := '7' || substr(v_digits, 2);
  end if;

  -- Bare national number without country code: "7XX XXX XX XX" (10 digits).
  if length(v_digits) = 10 and left(v_digits, 1) = '7' then
    v_digits := '7' || v_digits;
  end if;

  -- Canonical: country code 7 + KZ mobile-prefix digit 7 + 9 further digits.
  if v_digits ~ '^77[0-9]{9}$' then
    return '+' || v_digits;
  end if;

  return null;
end;
$$;

comment on function public.normalize_kz_mobile_phone(text) is
  'Canonicalizes Kazakhstan mobile numbers to E.164 +77XXXXXXXXX. Accepts "+7 7XX...", "8 7XX...", "77XXXXXXXXX", bare "7XXXXXXXXX"; strips all formatting; returns null for anything else (incl. landlines) — the only automatic identity match key for academy_people.';

revoke all on function public.normalize_kz_mobile_phone(text) from public;
revoke all on function public.normalize_kz_mobile_phone(text) from anon;
revoke all on function public.normalize_kz_mobile_phone(text) from authenticated;

create or replace function public.candidate_status_progress_rank(p_status text)
returns smallint
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_status
    when 'hired' then 6
    when 'trainee' then 5
    when 'intern' then 5
    when 'interview_passed' then 4
    when 'invited' then 3
    when 'suitable' then 2
    when 'questionable' then 2
    when 'maybe' then 2
    when 'new' then 1
    when 'rejected' then 0
    else 1
  end;
$$;

comment on function public.candidate_status_progress_rank(text) is
  'Pipeline-progress rank for candidate status, furthest-along = highest, rejected = lowest. Used to pick the current/surviving application within a (person, vacancy) group, both at backfill time and on every subsequent status change.';

revoke all on function public.candidate_status_progress_rank(text) from public;
revoke all on function public.candidate_status_progress_rank(text) from anon;
revoke all on function public.candidate_status_progress_rank(text) from authenticated;

-- ---------------------------------------------------------------------------
-- 1) academy_people: applicant identity, matched only by exact canonical phone
-- ---------------------------------------------------------------------------

create table if not exists public.academy_people (
  id uuid primary key default gen_random_uuid(),
  phone_canonical text,
  phone_display text not null,
  first_name text,
  last_name text,
  full_name text,
  merged_into_person_id uuid references public.academy_people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.academy_people is
  'Recruitment applicant identity. One row per distinct canonical KZ mobile phone; academy_candidates stays the application/history table. Matched only by exact canonical phone — never by name, age, or city.';
comment on column public.academy_people.phone_canonical is
  'E.164 +77XXXXXXXXX. Null for legacy phones that could not be normalized during backfill; each such applicant gets its own distinct, non-deduped person row so no application is lost or silently merged.';
comment on column public.academy_people.phone_display is
  'Human-friendly phone for HR display: the canonical value when known, otherwise the best-effort original legacy text.';
comment on column public.academy_people.merged_into_person_id is
  'Manual-merge / audit foundation. Not written by any current code path; no automatic or destructive merging is implemented.';

create unique index if not exists academy_people_phone_canonical_uidx
  on public.academy_people (phone_canonical)
  where phone_canonical is not null;

create index if not exists idx_academy_people_created on public.academy_people(created_at);
create index if not exists idx_academy_people_merged_into_person
  on public.academy_people (merged_into_person_id)
  where merged_into_person_id is not null;

drop trigger if exists academy_people_updated_at on public.academy_people;
create trigger academy_people_updated_at
  before update on public.academy_people for each row execute function academy_set_updated_at();

alter table public.academy_people enable row level security;

drop policy if exists academy_people_hr_select on public.academy_people;

revoke all on table public.academy_people from anon;
revoke all on table public.academy_people from authenticated;
grant select on table public.academy_people to authenticated;
grant all on table public.academy_people to service_role;

create policy academy_people_hr_select
  on public.academy_people
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('recruitment.view')
    or auth_private.current_user_has_permission('recruitment.manage_candidates')
  );

-- No authenticated insert/update/delete policies: people rows are written only
-- by the security-definer submit RPC (runs as owner, bypasses RLS by design),
-- matching the recruitment_application_uploads pattern (RPC-only writes).

-- ---------------------------------------------------------------------------
-- 2) academy_candidates: person link + idempotency + current-application flag
-- ---------------------------------------------------------------------------

alter table public.academy_candidates
  add column if not exists person_id uuid references public.academy_people(id) on delete set null,
  add column if not exists submission_key uuid,
  add column if not exists is_current_application boolean not null default false;

comment on column public.academy_candidates.person_id is
  'Links this application to its applicant identity (academy_people). Backfilled for all pre-existing rows; null only if a future direct insert bypasses the submit RPC.';
comment on column public.academy_candidates.submission_key is
  'Client-generated UUID, one per browser submission attempt (persisted for retries/reloads). Unique when present; lets the RPC replay the original result instead of inserting a duplicate.';
comment on column public.academy_candidates.is_current_application is
  'Maintained by academy_candidates_maintain_current_trg. At most one true per (person_id, vacancy_id): the furthest-progressed, most-recently-submitted application in that group. A rejected application stays current only while it is the sole application in its group, so reapplying after rejection is always allowed.';

create index if not exists idx_candidates_person on public.academy_candidates(person_id);

create unique index if not exists academy_candidates_submission_key_uidx
  on public.academy_candidates (submission_key)
  where submission_key is not null;

create unique index if not exists academy_candidates_person_vacancy_current_uidx
  on public.academy_candidates (person_id, vacancy_id)
  where is_current_application and person_id is not null and vacancy_id is not null;

-- ---------------------------------------------------------------------------
-- 3) Backfill: one person per distinct canonical phone; unmatched legacy
-- phones each get their own distinct (non-deduped) person. Conservative —
-- no candidate row is ever deleted, reassigned in status, or has notes/answers
-- touched by this block.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  v_person_id uuid;
  v_canonical text;
  v_full_name text;
begin
  for r in
    select c.id, c.phone, c.first_name, c.last_name, c.full_name, c.submitted_at
    from public.academy_candidates c
    where c.person_id is null
    order by c.submitted_at asc, c.id asc
  loop
    v_canonical := public.normalize_kz_mobile_phone(r.phone);
    v_full_name := coalesce(
      nullif(btrim(coalesce(r.full_name, '')), ''),
      nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), '')
    );

    if v_canonical is not null then
      select id into v_person_id
      from public.academy_people
      where phone_canonical = v_canonical;

      if v_person_id is null then
        insert into public.academy_people (
          phone_canonical, phone_display, first_name, last_name, full_name
        ) values (
          v_canonical, v_canonical, r.first_name, r.last_name, v_full_name
        )
        returning id into v_person_id;
      end if;
    else
      -- Cannot normalize: preserve the application, create a distinct
      -- non-deduped person so nothing is lost or silently merged.
      insert into public.academy_people (
        phone_canonical, phone_display, first_name, last_name, full_name
      ) values (
        null, coalesce(nullif(btrim(coalesce(r.phone, '')), ''), 'Не указан'),
        r.first_name, r.last_name, v_full_name
      )
      returning id into v_person_id;
    end if;

    update public.academy_candidates set person_id = v_person_id where id = r.id;
  end loop;
end $$;

do $$
declare
  v_unlinked int;
begin
  select count(*)::int into v_unlinked from public.academy_candidates where person_id is null;
  if v_unlinked > 0 then
    raise exception
      'recruitment_candidate_people_idempotency: % candidates still have no person_id after backfill',
      v_unlinked;
  end if;
end $$;

-- Backfill is_current_application per (person, vacancy) group: furthest HR
-- status wins, then most recent submission — same rule the trigger below
-- enforces going forward. This is what resolves the one known pre-existing
-- same-person/same-vacancy duplicate: both applications are kept as-is,
-- only this flag differs between them.
with ranked as (
  select
    c.id,
    row_number() over (
      partition by c.person_id, c.vacancy_id
      order by public.candidate_status_progress_rank(c.status) desc, c.submitted_at desc, c.id desc
    ) as rn
  from public.academy_candidates c
  where c.person_id is not null and c.vacancy_id is not null
)
update public.academy_candidates c
set is_current_application = (r.rn = 1)
from ranked r
where c.id = r.id
  and c.is_current_application is distinct from (r.rn = 1);

-- ---------------------------------------------------------------------------
-- 4) Trigger: keep is_current_application correct under any status change,
-- not only at insert time (HR reject/restore/hire all go through plain
-- UPDATEs on this table, not a dedicated RPC).
-- ---------------------------------------------------------------------------

create or replace function public.academy_candidates_maintain_current()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person uuid;
  v_vacancy uuid;
  v_winner uuid;
begin
  if tg_op = 'DELETE' then
    v_person := old.person_id;
    v_vacancy := old.vacancy_id;
  else
    v_person := new.person_id;
    v_vacancy := new.vacancy_id;
  end if;

  if v_person is not null and v_vacancy is not null then
    select id into v_winner
    from public.academy_candidates
    where person_id = v_person and vacancy_id = v_vacancy
    order by public.candidate_status_progress_rank(status) desc, submitted_at desc, id desc
    limit 1;

    -- Demote losers before promoting the winner: never two trues at once,
    -- which would trip the partial unique index mid-statement.
    update public.academy_candidates
    set is_current_application = false
    where person_id = v_person and vacancy_id = v_vacancy
      and id is distinct from v_winner
      and is_current_application;

    if v_winner is not null then
      update public.academy_candidates
      set is_current_application = true
      where id = v_winner and not is_current_application;
    end if;
  end if;

  -- Defensive: if person/vacancy changed on this row, also resettle its old group.
  if tg_op = 'UPDATE'
     and (old.person_id is distinct from new.person_id or old.vacancy_id is distinct from new.vacancy_id)
     and old.person_id is not null and old.vacancy_id is not null then
    select id into v_winner
    from public.academy_candidates
    where person_id = old.person_id and vacancy_id = old.vacancy_id
    order by public.candidate_status_progress_rank(status) desc, submitted_at desc, id desc
    limit 1;

    update public.academy_candidates
    set is_current_application = false
    where person_id = old.person_id and vacancy_id = old.vacancy_id
      and id is distinct from v_winner
      and is_current_application;

    if v_winner is not null then
      update public.academy_candidates
      set is_current_application = true
      where id = v_winner and not is_current_application;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function public.academy_candidates_maintain_current() is
  'Maintains is_current_application invariant per (person_id, vacancy_id): at most one true, chosen by furthest status progress then most recent submission. Runs after insert/update/delete so HR status changes (reject/restore/hire via plain UPDATE) keep the flag correct, not just new submissions.';

-- Trigger invocation itself does not require EXECUTE (the executor calls
-- trigger functions internally); this only blocks a role from invoking it
-- directly as an ordinary function.
revoke all on function public.academy_candidates_maintain_current() from public;
revoke all on function public.academy_candidates_maintain_current() from anon;
revoke all on function public.academy_candidates_maintain_current() from authenticated;

drop trigger if exists academy_candidates_maintain_current_trg on public.academy_candidates;
create trigger academy_candidates_maintain_current_trg
  after insert or update of status, person_id, vacancy_id or delete
  on public.academy_candidates
  for each row
  execute function public.academy_candidates_maintain_current();

-- ---------------------------------------------------------------------------
-- 5) Core submit logic (private schema, not PostgREST-exposed): phone
-- normalization, person find-or-create, current-application idempotency,
-- submission_key replay. Advisory-locked to avoid SELECT-then-INSERT races;
-- unique indexes are the DB-enforced backstop.
-- ---------------------------------------------------------------------------

create schema if not exists recruitment_private;

-- Not reachable via PostgREST at all (only the public schema is exposed),
-- and not reachable via direct SQL either: schema USAGE stays with the
-- owner/service_role only. The two public.submit_candidate_application
-- overloads (security definer, running as owner) are the sole anon entry point.
revoke all on schema recruitment_private from public;
revoke all on schema recruitment_private from anon;
revoke all on schema recruitment_private from authenticated;
grant usage on schema recruitment_private to service_role;

create or replace function recruitment_private.submit_candidate_application_core(
  p_vacancy_id uuid,
  p_answers jsonb,
  p_form_version integer,
  p_photo_upload_id uuid,
  p_submission_key uuid
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
  v_canonical_phone text;
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
  v_person public.academy_people%rowtype;
  v_existing_by_key public.academy_candidates%rowtype;
  v_current public.academy_candidates%rowtype;
  v_full_name text;
begin
  if p_vacancy_id is null then
    raise exception 'vacancy_required' using errcode = 'P0001';
  end if;

  -- Idempotent replay: this exact browser submission already succeeded.
  if p_submission_key is not null then
    perform pg_advisory_xact_lock(public.recruitment_advisory_key('subkey:' || p_submission_key::text));

    select * into v_existing_by_key
    from public.academy_candidates
    where submission_key = p_submission_key;

    if found then
      if v_existing_by_key.vacancy_id is distinct from p_vacancy_id then
        raise exception 'submission_key_conflict' using errcode = 'P0001';
      end if;

      if p_photo_upload_id is not null then
        update public.recruitment_application_uploads
        set cancelled_at = coalesce(cancelled_at, now())
        where id = p_photo_upload_id and used_at is null;
      end if;

      return jsonb_build_object(
        'ok', true,
        'candidate_id', v_existing_by_key.id,
        'duplicate', true,
        'message', 'Анкета уже была отправлена ранее. Мы свяжемся с вами после рассмотрения.'
      );
    end if;
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

  v_canonical_phone := public.normalize_kz_mobile_phone(v_phone);
  if v_canonical_phone is null then
    raise exception 'phone_invalid_kz' using errcode = 'P0001';
  end if;

  v_first := btrim(v_first);
  v_last := coalesce(btrim(v_last), '');
  v_full_name := btrim(v_first || ' ' || v_last);

  -- Identity: exact canonical phone match only. Never auto-merge by name/age/city.
  perform pg_advisory_xact_lock(public.recruitment_advisory_key('person:' || v_canonical_phone));

  select * into v_person
  from public.academy_people
  where phone_canonical = v_canonical_phone;

  if not found then
    insert into public.academy_people (
      phone_canonical, phone_display, first_name, last_name, full_name
    ) values (
      v_canonical_phone, v_canonical_phone, v_first, nullif(v_last, ''), v_full_name
    )
    returning * into v_person;
  end if;

  -- Current-application guard: same person + same vacancy + non-rejected ->
  -- atomically return the existing application, never insert a duplicate,
  -- never touch its status/notes/answers/photo.
  perform pg_advisory_xact_lock(
    public.recruitment_advisory_key('pv:' || v_person.id::text || ':' || p_vacancy_id::text)
  );

  select * into v_current
  from public.academy_candidates
  where person_id = v_person.id
    and vacancy_id = p_vacancy_id
    and is_current_application
    and status <> 'rejected';

  if found then
    if p_photo_upload_id is not null then
      update public.recruitment_application_uploads
      set cancelled_at = coalesce(cancelled_at, now())
      where id = p_photo_upload_id and used_at is null;
    end if;

    return jsonb_build_object(
      'ok', true,
      'candidate_id', v_current.id,
      'duplicate', true,
      'message', 'Вы уже откликались на эту вакансию. Мы свяжемся с вами после рассмотрения.'
    );
  end if;

  begin
    insert into public.academy_candidates (
      vacancy_id, person_id, submission_key, first_name, last_name, full_name, phone, age, city, experience,
      previous_work, expected_salary, available_from, about, answers,
      photo_url, photo_path, score_percent, total_score, max_score, status
    ) values (
      p_vacancy_id,
      v_person.id,
      p_submission_key,
      v_first,
      v_last,
      v_full_name,
      v_canonical_phone,
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
  exception when unique_violation then
    -- Safety net for the submission_key unique index: a concurrent retry with
    -- the exact same key beat us past the advisory lock (or it wasn't held).
    if p_submission_key is not null then
      select * into v_existing_by_key
      from public.academy_candidates
      where submission_key = p_submission_key;

      if found then
        if v_existing_by_key.vacancy_id is distinct from p_vacancy_id then
          raise exception 'submission_key_conflict' using errcode = 'P0001';
        end if;

        if p_photo_upload_id is not null then
          update public.recruitment_application_uploads
          set cancelled_at = coalesce(cancelled_at, now())
          where id = p_photo_upload_id and used_at is null;
        end if;

        return jsonb_build_object(
          'ok', true,
          'candidate_id', v_existing_by_key.id,
          'duplicate', true,
          'message', 'Анкета уже была отправлена ранее. Мы свяжемся с вами после рассмотрения.'
        );
      end if;
    end if;
    raise;
  end;

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
    'duplicate', false,
    'message', 'Анкета успешно отправлена. Мы свяжемся с вами после рассмотрения.'
  );
end;
$$;

revoke all on function recruitment_private.submit_candidate_application_core(uuid, jsonb, integer, uuid, uuid) from public;
revoke all on function recruitment_private.submit_candidate_application_core(uuid, jsonb, integer, uuid, uuid) from anon;
revoke all on function recruitment_private.submit_candidate_application_core(uuid, jsonb, integer, uuid, uuid) from authenticated;
grant execute on function recruitment_private.submit_candidate_application_core(uuid, jsonb, integer, uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6) Public RPC surface: new 5-arg shape with submission_key, plus a legacy
-- 4-arg overload kept for rolling-deploy compatibility (old frontend bundles
-- calling mid-deploy get the same normalization/dedupe protection, just
-- without idempotent replay-by-key since they have no key to send).
-- ---------------------------------------------------------------------------

create or replace function public.submit_candidate_application(
  p_vacancy_id uuid,
  p_answers jsonb,
  p_form_version integer,
  p_photo_upload_id uuid default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select recruitment_private.submit_candidate_application_core(
    p_vacancy_id, p_answers, p_form_version, p_photo_upload_id, null
  );
$$;

comment on function public.submit_candidate_application(uuid, jsonb, integer, uuid) is
  'Legacy 4-arg shape (pre-idempotency-key frontend), kept for rolling-deploy compatibility. Delegates to recruitment_private.submit_candidate_application_core with no submission key.';

revoke all on function public.submit_candidate_application(uuid, jsonb, integer, uuid) from public;
grant execute on function public.submit_candidate_application(uuid, jsonb, integer, uuid)
  to anon, authenticated, service_role;

create or replace function public.submit_candidate_application(
  p_vacancy_id uuid,
  p_answers jsonb,
  p_form_version integer,
  p_photo_upload_id uuid,
  p_submission_key uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select recruitment_private.submit_candidate_application_core(
    p_vacancy_id, p_answers, p_form_version, p_photo_upload_id, p_submission_key
  );
$$;

comment on function public.submit_candidate_application(uuid, jsonb, integer, uuid, uuid) is
  'Public apply submit. Normalizes the KZ mobile phone answer, finds-or-creates the applicant person by exact canonical phone, and atomically returns the existing current application instead of inserting a duplicate for the same person+vacancy. Idempotent replay by submission_key.';

revoke all on function public.submit_candidate_application(uuid, jsonb, integer, uuid, uuid) from public;
grant execute on function public.submit_candidate_application(uuid, jsonb, integer, uuid, uuid)
  to anon, authenticated, service_role;
