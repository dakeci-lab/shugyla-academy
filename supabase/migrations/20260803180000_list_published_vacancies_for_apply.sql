-- Stage 4: public RPC for /apply hub.
-- Whitelist columns only; joins positions server-side so anon never SELECTs positions.

create or replace function public.list_published_vacancies_for_apply()
returns table (
  id uuid,
  title text,
  slug text,
  description text,
  position_name text,
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
  'Public apply hub: published vacancies with active non-archived positions. Whitelist fields only.';

revoke all on function public.list_published_vacancies_for_apply() from public;
grant execute on function public.list_published_vacancies_for_apply() to anon, authenticated, service_role;
