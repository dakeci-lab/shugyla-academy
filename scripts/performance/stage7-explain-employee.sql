-- Stage 7 — EXPLAIN for Query A (employee mapping).
-- Mirrors Edge: serviceClient.from('academy_users')
--   .select('id, status, role, role_id, auth_user_id')
--   .eq('auth_user_id', <verified auth uid>)
--   .maybeSingle()
--
-- Placeholders only — do not commit real UUIDs.
-- Prefer EXPLAIN first; EXPLAIN ANALYZE is OK for this LIMIT-1 lookup.

-- Estimated plan (safe default):
explain (format text)
select id, status, role, role_id, auth_user_id
from public.academy_users
where auth_user_id = (
  select auth_user_id
  from public.academy_users
  where auth_user_id is not null
  order by id
  limit 1
)
limit 1;

-- Optional measured plan (read-only SELECT):
-- explain (analyze, buffers, format text)
-- select id, status, role, role_id, auth_user_id
-- from public.academy_users
-- where auth_user_id = (
--   select auth_user_id
--   from public.academy_users
--   where auth_user_id is not null
--   order by id
--   limit 1
-- )
-- limit 1;
