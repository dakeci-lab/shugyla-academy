# Stage 20 — apply report (2026-10-22, prod `cxadzerxndlscwvdaymk`)

Applied by hand through the Supabase MCP; the single-script `apply_migration` call timed out twice at the
MCP layer (database untouched each time — verified before retrying), so the migration went in parts:

1. `apply_migration supply_returns_refund_marking_columns` — columns + indexes + comments (the only part
   recorded in Supabase's migration history).
2. `execute_sql` — backfill: 209 returns marked received by the director (`academy_users.id = 1`).
3. `execute_sql` — column-level `grant update` (3 columns) and policy `umag_supply_returns_update_refund_mark`.
   Note: `drop policy if exists` before `create policy` hung the connection; the policy was created without it.

Postcheck: `unmarked = 0`, `marked = 209`, `by_director = 209`, `update_grant_columns = 3`, `update_policy = 1`.
The migration file in the repo is the complete version (same end state).
