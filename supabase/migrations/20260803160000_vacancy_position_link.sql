-- Stage 3: link academy_vacancies to centralized positions catalog.
-- Idempotent. Does not invent RBAC roles from position names.
-- ON DELETE RESTRICT matches academy_users.position_id and position archive policy.

begin;

-- ---------------------------------------------------------------------------
-- 1) Columns
-- ---------------------------------------------------------------------------

alter table public.academy_vacancies
  add column if not exists position_id uuid null;

alter table public.academy_vacancies
  add column if not exists position_name_snapshot text null;

-- Legacy system-role fields remain; allow null for new position-first vacancies.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'academy_vacancies'
      and column_name = 'role'
      and is_nullable = 'NO'
  ) then
    alter table public.academy_vacancies alter column role drop not null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Foreign key (RESTRICT — no cascade delete of vacancies)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'academy_vacancies_position_id_fkey'
      and conrelid = 'public.academy_vacancies'::regclass
  ) then
    alter table public.academy_vacancies
      add constraint academy_vacancies_position_id_fkey
      foreign key (position_id)
      references public.positions (id)
      on delete restrict;
  end if;
end $$;

create index if not exists academy_vacancies_position_id_idx
  on public.academy_vacancies (position_id);

comment on column public.academy_vacancies.position_id is
  'Centralized organization position (positions.id). Required for new/edited vacancies in app.';
comment on column public.academy_vacancies.position_name_snapshot is
  'Display-name snapshot for public/history fallback. Not a second catalog.';

-- ---------------------------------------------------------------------------
-- 3) Keep snapshot in sync when position_id is set/changed (DB-side)
-- ---------------------------------------------------------------------------

create or replace function public.academy_vacancies_sync_position_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  -- Keep historical snapshot if position_id cleared; refresh from catalog when linked.
  if new.position_id is null then
    return new;
  end if;

  select p.name into v_name
  from public.positions p
  where p.id = new.position_id;

  if v_name is null then
    raise exception 'position_not_found' using errcode = 'P0001';
  end if;

  new.position_name_snapshot := v_name;
  return new;
end;
$$;

drop trigger if exists academy_vacancies_sync_position_snapshot on public.academy_vacancies;
create trigger academy_vacancies_sync_position_snapshot
  before insert or update
  on public.academy_vacancies
  for each row
  execute function public.academy_vacancies_sync_position_snapshot();

-- ---------------------------------------------------------------------------
-- 4) Safe exact-match backfill (normalized name only; no fuzzy / no role-only)
-- ---------------------------------------------------------------------------

with normalized_positions as (
  select
    id,
    name,
    lower(btrim(regexp_replace(replace(name, 'ё', 'е'), '[[:space:]-]+', ' ', 'g'))) as norm_name
  from public.positions
),
normalized_vacancies as (
  select
    id,
    title,
    lower(btrim(regexp_replace(replace(title, 'ё', 'е'), '[[:space:]-]+', ' ', 'g'))) as norm_title
  from public.academy_vacancies
  where position_id is null
),
exact as (
  select
    v.id as vacancy_id,
    p.id as position_id,
    p.name as position_name,
    count(*) over (partition by v.id) as match_count
  from normalized_vacancies v
  join normalized_positions p on p.norm_name = v.norm_title
)
update public.academy_vacancies av
set
  position_id = e.position_id,
  position_name_snapshot = e.position_name
from exact e
where av.id = e.vacancy_id
  and e.match_count = 1
  and av.position_id is null;

commit;
