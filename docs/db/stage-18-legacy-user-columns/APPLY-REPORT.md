# Stage 18 phase B — apply report (2026-10-17)

Applied on prod via MCP migration `drop_legacy_academy_users_columns` after the frontend (commit 8e0ea03) and the three
employee Edge Functions were deployed. Preflight: 0 dependents besides the columns' own CHECK constraints and the FK.

Postcheck: the four columns are gone, no FK points to `platform_work_locations` any more (table still has 1 row and
is not part of this stage), active users = 3. `academy_users` now has 16 columns.

Noticed, not changed: column `academy_users.password` is non-empty for 2 of 3 rows. Auth runs through Supabase Auth;
whether this column is still needed (and what it holds) is a separate question.
