# Stage 7A audit notes

## Production project

| Field | Value |
|---|---|
| Project ref | `cxadzerxndlscwvdaymk` |
| API host | `https://cxadzerxndlscwvdaymk.supabase.co` |
| Confirmed via | REST `sb-project-ref` header; production SPA bundle host |
| Frontend SHA | `0fe0aad` |
| Local `.env.local` | points to **localhost** — not used as production substitute |
| SQL / `pg_dump` access | **unavailable** in this audit environment |
| Supabase CLI | not installed; project not linked |

## REST anon probes (2026-08-02 UTC)

Public anon JWT from production SPA (role=`anon`, ref=`cxadzerxndlscwvdaymk`) used only for `limit=0` + `Prefer: count=exact`. Token not stored in repo.

| Table | HTTP | Count |
|---|---|---|
| academy_courses | 206 | 7 |
| academy_lessons | 206 | 36 |
| academy_course_assignments | 401 | unknown (exists; GRANT/RLS blocks anon) |
| academy_progress | 200 | 0 |
| academy_tests | 206 | 1 |
| academy_test_questions | 206 | 2 |
| academy_test_attempts | 200 | 0 |
| academy_learning_paths | 206 | 1 |
| academy_learning_path_courses | 206 | 2 |
| academy_user_learning_paths | 200 | 0 |

Must-preserve existence (partial):

| Table | Result |
|---|---|
| academy_users | 401 (exists) |
| academy_employee_shifts | 401 (exists) |
| academy_vacancies | count 2 |
| academy_candidates | count 11 |
| academy_standard_* | present (articles 12, reads 11) |
| permissions / roles | 401 (cannot enumerate learning codes via anon) |

## Gaps requiring privileged SQL before GO

1. Exact `academy_course_assignments` row count  
2. Table/index sizes  
3. Full FK graph from `pg_constraint` (confirm no inbound non-learning FKs)  
4. RLS policy definitions currently live in production (may differ from early schema.sql anon-open policies)  
5. Permission IDs + role_permissions link counts for `academy.*`  
6. Functions/views/cron referencing learning tables  
7. Offline backup + SHA-256  

## Repo consumers

No Edge Function references learning tables. Active `src/` has zero learning table strings. Remaining hits: migrations/schema, docs, verify scripts (negative assertions), local fixtures.

## CI/CD

`.github/workflows/{deploy,main}.yml` — GitHub Pages frontend only. **No** `supabase db push` / migration apply.
