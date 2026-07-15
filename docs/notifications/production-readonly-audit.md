# Production Read-Only Audit — Step 22A

**Date:** 2026-07-14
**Local checkpoint:** `6648b3d` — `feat: complete local notification system and production preflight`  
**Branch:** `main`  
**Owner approval:** read-only production check only; no writes performed.

---

## 1. Verified project ref

| Field | Value |
|-------|-------|
| **Expected ref** | `cxadzerxndlscwvdaymk` |
| **Confirmed ref** | `cxadzerxndlscwvdaymk` ✓ |

**Confirmation sources (read-only, no secrets printed):**

1. Supabase REST gateway response header `sb-project-ref` on `https://cxadzerxndlscwvdaymk.supabase.co/rest/v1/` (unauthenticated HEAD).
2. Anon JWT payload `ref` field from deployed GitHub Pages bundle (`https://dakeci-lab.github.io/shugyla-academy/`).
3. Local guard constants in verify scripts and Edge Function production markers.

**Repo link status:** not linked (`supabase/.temp/project-ref` absent). `supabase link` was **not** run.

---

## 2. Project metadata (no secrets)

| Field | Value |
|-------|-------|
| Project ref | `cxadzerxndlscwvdaymk` |
| API URL hostname | `https://cxadzerxndlscwvdaymk.supabase.co` |
| Project name | **shugyla-academy** (confirmed_by_cli, Step 22B) |
| Region | **ap-northeast-2** (confirmed_by_cli) |
| Postgres version | **17.6.1.141** (engine 17, confirmed_by_cli) |
| Status | **ACTIVE_HEALTHY** (confirmed_by_cli) |
| Organization | `qdwgubekqmnggldjzlor` (slug only, no secrets) |
| Created | 2026-07-08 |
| Deployed frontend | GitHub Pages `dakeci-lab.github.io/shugyla-academy/` uses this production URL |

---

## 3. Read-only access methods used

| Method | Used | Result |
|--------|------|--------|
| Supabase CLI (`projects list`) | Step 22A: blocked; **Step 22B: success** | project metadata confirmed |
| Supabase CLI (`functions list --project-ref`) | Step 22B | empty list `[]` |
| Supabase CLI (`secrets list --project-ref`) | Step 22B | empty list `[]` |
| Supabase CLI (`migration list`) | Step 22B attempted | **Requires link / db-url / password** — not run |
| `SUPABASE_ACCESS_TOKEN` env | checked | unset (CLI session via `login`) |
| `supabase link` | **not run** | per instructions |
| Direct PostgreSQL (`BEGIN READ ONLY`) | unavailable | no DB password / connection string |
| PostgREST HEAD/GET via public anon key (GitHub Pages bundle) | **used** | table existence, column probes, aggregate counts |
| Edge Function URL probe (OPTIONS/GET, no invocation body) | **used** | all return HTTP 404 |
| OpenAPI schema (`/rest/v1/`) | attempted | requires `service_role` — not used |
| Secrets name listing | Step 22B | **all missing** (empty list) |
| pg_cron / Cron / RLS / grants | unavailable_without_sql_access | `inspect db` and `db query` require `--linked` or `--db-url` |

**No INSERT/UPDATE/DELETE/DDL/deploy executed.**

---

## 4. Production migration history summary

**Exact `supabase_migrations.schema_migrations` history: unavailable_without_link_or_database_access**

Step 22B: `supabase migration list` has no `--project-ref` flag. Allowed flags: `--linked`, `--local`, `--db-url`, `--password`. Without link or DB credentials, command fails: `Cannot find project ref. Have you run supabase link?`

**Inferred state from live schema (PostgREST probes):**

| Evidence | Inference |
|----------|-----------|
| `roles` (9), `permissions` (50), `role_permissions` (137), `schedule.edit` permission exists | `20260712163000_complete_flexible_rbac.sql` — **likely already_applied** |
| No `auth_user_id` on `academy_users`; no `notification_*` tables | Steps 15–21 notification/auth migrations — **missing** |
| `academy_users.password` column exists | Legacy auth schema still active |
| `academy_employee_shifts` with dispatch columns exists | Base shift schema present; dispatch grant migration status unknown |

**Legacy untimestamped migrations** (`add_*.sql`, etc.): cannot be matched to `schema_migrations` without SQL access. Production clearly has core academy tables (users, shifts, RBAC) — applied historically, method uncertain.

---

## 5. Local vs production migration gap

### Timestamp migrations (Steps 15–21 focus)

| Local migration | Production status | Dependency satisfied | Safe to apply later | Notes |
|-----------------|-------------------|----------------------|---------------------|-------|
| `20260712163000_complete_flexible_rbac.sql` | **already_applied** (inferred) | yes — `roles`/`permissions` exist | cautious re-run (idempotent elements) | Confirm via `migration list` before apply |
| `20260713194500_notification_system_foundation.sql` | **missing** | yes — RBAC + `academy_users` exist | **yes** (first notification migration) | Creates all notification tables + `auth_user_id` |
| `20260714062253_web_push_delivery_tracking.sql` | **missing** | n/a — duplicate | **no — skip** | Use canonical `20260714150000` only |
| `20260714120000_auth_first_login_foundation.sql` | **missing** | requires notification foundation + `auth_user_id` | **yes** after #2 | **High risk** — drops permissive anon `academy_users` policy |
| `20260714130000_employee_provisioning_service_grants.sql` | **missing** / uncertain | requires RBAC tables | **yes** after #2–#3 | Grants only; not visible via PostgREST |
| `20260714140000_web_push_subscription_foundation.sql` | **missing** | requires notification foundation | **yes** | Additive ALTER |
| `20260714150000_web_push_delivery_tracking.sql` | **missing** | requires subscriptions table | **yes** | Canonical delivery tracking file |
| `20260714160000_time_tracker_dispatch_grants.sql` | **missing** / uncertain | `academy_employee_shifts` exists | **yes** | `GRANT SELECT` to `service_role` |

### Legacy local migrations (untimestamped)

| Category | Production status | Notes |
|----------|-------------------|-------|
| `add_rbac_system.sql`, `add_rbac_flexible_v2.sql` | uncertain / superseded | Flexible RBAC migration appears applied |
| `add_employee_shifts.sql` + fixes | **already_applied** (inferred) | 189 shift rows; dispatch columns present |
| Other module migrations | uncertain | Not required for notification rollout |

### Drift checks

| Check | Result |
|-------|--------|
| Same timestamp, different SQL | **uncertain** — cannot read production migration names |
| Production-only migrations | **uncertain** |
| Local migration depends on missing prod object | **no blocker** for notification chain — base tables exist |
| Timestamp order gaps | N/A until full history available |
| History drift | **uncertain** — partial inference only |

---

## 6. Schema comparison

### Tables audited

| Table | Production exists | Notes |
|-------|-------------------|-------|
| `academy_users` | **yes** | 17 rows |
| `academy_employee_shifts` | **yes** | 189 rows |
| `academy_roles` | **no** | Production uses `roles` (flexible RBAC) |
| `roles` | **yes** | 9 rows |
| `permissions` | **yes** | 50 rows |
| `role_permissions` | **yes** | 137 rows |
| `notification_templates` | **no** | HTTP 404 |
| `notification_rules` | **no** | HTTP 404 |
| `notifications` | **no** | HTTP 404 |
| `notification_push_subscriptions` | **no** | HTTP 404 |
| `notification_deliveries` | **no** | HTTP 404 |
| `notification_preferences` | **no** | HTTP 404 |

### Critical fields — `academy_users`

| Field | Production | Local expectation |
|-------|------------|-------------------|
| `id` | exists | exists |
| `auth_user_id` | **missing** | added by notification foundation |
| `status` | exists | exists |
| `role_id` | exists | exists |
| `password` (legacy) | **exists** | exists locally; removed only with Auth-first cutover |

### Critical fields — `academy_employee_shifts`

| Field | Production |
|-------|------------|
| `id`, `employee_id`, `shift_date`, `status` | exists |
| `planned_start_time`, `planned_end_time` | exists |
| `actual_start_time`, `actual_end_time` | exists |
| `UNIQUE(employee_id, shift_date)` | unavailable_to_inspect (requires SQL catalog) |

### Notification tables

All **absent** in production — consistent with rollout not started.

---

## 7. RLS / policies comparison

**Full policy catalog: unavailable_to_inspect** (requires `pg_policies` SQL or authenticated CLI).

**Inferred from schema state:**

| Area | Production (inferred) | After planned migrations |
|------|----------------------|--------------------------|
| `academy_users` anon access | Likely **permissive legacy** (`password` column readable via anon PostgREST probe) | `20260714120000` removes anon read/write |
| Notification tables RLS | n/a — tables absent | Created disabled rules + employee-scoped policies |
| `service_role` shift read | uncertain | `20260714160000` adds explicit `GRANT SELECT` |

**Grants/triggers/indexes:** unavailable_to_inspect without direct SQL.

---

## 8. Auth-first readiness

| Check | Production |
|-------|------------|
| `academy_users.auth_user_id` exists | **no** |
| UNIQUE on `auth_user_id` | **no** |
| Own-profile RLS policies | **no** (auth-first migration not applied) |
| Legacy `password` column | **yes — present** |
| SQL functions using `password` | unavailable_to_inspect |
| Old auth logic in DB functions | unavailable_to_inspect |

**Verdict: Auth-first NOT READY in production.**

Employee provisioning Edge Functions require Auth-first + `auth_user_id` backfill (`20260713194500` then `20260714120000`).

---

## 9. Legacy password status

| Item | Status |
|------|--------|
| `academy_users.password` column | **present** |
| Column values | **not read** (per safety rules) |
| PostgREST anon can reference column | yes (structural probe `limit=0`) |

**Technical debt:** legacy password authentication still active in production schema. Separate Auth-first cutover required before treating production as Auth-only.

---

## 10. Notification tables readiness

| Component | Production |
|-----------|------------|
| All 6 notification tables | **absent** |
| Seed templates (`time_tracker.*`) | **absent** |
| Seed rules (`time_tracker.rule.*`) | **absent** |
| `notifications.manage` permission | **not found** |

**Verdict: notification foundation NOT deployed.** Matches expectation that Steps 15–21 rollout has not started.

---

## 11. Time-tracker schema readiness

| Item | Production |
|------|------------|
| `academy_employee_shifts` table | **yes** — 189 rows |
| Dispatch-required columns | **present** |
| `service_role` SELECT grant | **uncertain** (grant migration not inferable) |
| Enabled `time_tracker.rule.*` | **n/a** — rules table absent |

**Verdict: shift data ready; notification/dispatch layer not deployed.**

---

## 12. Edge Functions status

Probed via `OPTIONS` and `GET` on `/functions/v1/<name>` — **no function body invoked**.

| Function | Deployed | Version/time | verify_jwt | Expected future role |
|----------|----------|--------------|------------|----------------------|
| `admin-create-employee` | **not_deployed** | confirmed_by_cli (`[]`) + PostgREST 404 | n/a | JWT + RBAC admin |
| `admin-list-employees` | **not_deployed** | confirmed_by_cli + PostgREST 404 | n/a | JWT + RBAC admin |
| `admin-update-employee` | **not_deployed** | confirmed_by_cli + PostgREST 404 | n/a | JWT + RBAC admin |
| `manage-push-subscription` | **not_deployed** | confirmed_by_cli + PostgREST 404 | n/a | JWT + employee ownership |
| `send-test-web-push` | **not_deployed** | confirmed_by_cli + PostgREST 404 | n/a | **Must stay disabled / not deployed** |
| `dispatch-time-tracker-notifications` | **not_deployed** | confirmed_by_cli + PostgREST 404 | n/a | JWT + RBAC; test flags false |
| `run-time-tracker-notification-scheduler` | **not_deployed** | confirmed_by_cli + PostgREST 404 | n/a | HMAC only; `ENABLED=false` initially |

**Matches expectation:** no notification Edge Functions deployed yet.

---

## 13. Secrets presence

CLI `secrets list --project-ref cxadzerxndlscwvdaymk` returned **empty list** (Step 22B).

| Secret name | Status |
|-------------|--------|
| `VAPID_PUBLIC_KEY` | **missing** |
| `VAPID_PRIVATE_KEY` | **missing** |
| `VAPID_SUBJECT` | **missing** |
| `WEB_PUSH_TEST_ENABLED` | **missing** |
| `TIME_TRACKER_DISPATCH_TEST_ENABLED` | **missing** |
| `TIME_TRACKER_DISPATCH_REAL_TEST_ENABLED` | **missing** |
| `TIME_TRACKER_SCHEDULER_ENABLED` | **missing** |
| `TIME_TRACKER_SCHEDULER_TEST_MODE` | **missing** |
| `TIME_TRACKER_SCHEDULER_SECRET_CURRENT` | **missing** |
| `TIME_TRACKER_SCHEDULER_SECRET_PREVIOUS` | **missing** |

**Expected:** all missing until explicit secrets rollout (consistent with plan).

---

## 14. Cron / scheduler status

| Check | Status |
|-------|--------|
| `pg_cron` installed | unavailable_to_inspect |
| Notification/scheduler cron jobs | unavailable_to_inspect |
| Supabase dashboard scheduled invocations | unavailable_to_inspect |
| GitHub Actions scheduler workflow | **none** — only Pages deploy workflows |

**Expected:** no notification scheduler Cron. Cannot fully confirm without SQL/CLI.

---

## 15. Safe aggregate counts

| Metric | Count | Method |
|--------|-------|--------|
| `academy_users` total | **17** | PostgREST `Prefer: count=exact` HEAD |
| Active `academy_users` (`status=active`) | **9** | filtered HEAD |
| `academy_employee_shifts` rows | **189** | PostgREST HEAD |
| `notification_rules` | n/a | table absent |
| Enabled `notification_rules` | **0** (by absence) | table absent |
| `notifications` | n/a | table absent |
| Active push subscriptions | n/a | table absent |

No per-employee grouping. No PII printed.

---

## 16. Critical blockers

1. **Supabase CLI not authenticated** — cannot read exact `schema_migrations`, RLS policy SQL, grants, secrets names, or pg_cron. Owner must run `supabase login` locally (manual; no token in chat).
2. **Full migration history unverified** — flexible RBAC inferred applied; exact timestamp alignment unconfirmed.
3. **Auth-first not ready** — `auth_user_id` absent; legacy `password` still present.
4. **Notification system absent** — all notification tables missing (expected pre-rollout).

**No unexpected blockers found:**

- No enabled `time_tracker.rule.*` (rules table absent).
- No deployed notification Edge Functions.
- No evidence of active scheduler (functions 404; no GH Actions cron).

---

## 17. Non-critical differences

- Production uses `roles` not `academy_roles` (flexible RBAC naming).
- `permissions` count 50 vs local catalog — align during CLI audit.
- `employees.manage` / `notifications.manage` permissions not found via anon probe (may not exist until notification migration).
- OpenAPI schema requires `service_role` — structural audit limited to column existence probes.
- Local file `20260714062253_web_push_delivery_tracking.sql` is **empty** (0 bytes) — see Step 22B duplicate analysis; never apply.

---

## 18. Rollout readiness status

### **NOT_READY_FOR_DIRECT_NOTIFICATION_DEPLOY** (updated Step 22C)

Coordinated Auth cutover required before notification rollout or direct Auth-first frontend deploy.

| Criterion | Assessment |
|-----------|------------|
| Correct project | ✓ `cxadzerxndlscwvdaymk` |
| Anon exposure on core tables | ✓ confirmed (SQL audit) |
| Auth-first safe without provisioning | ✗ 1/17 Auth users |
| Notification migrations | ✗ not applied |
| Phased cutover prepared locally | ✓ Step 22C |

See [../auth/production-auth-cutover-plan.md](../auth/production-auth-cutover-plan.md).

---

## 19. Proposed exact rollout order

### Phase 0 — Remaining read-only audit (optional before write)

1. ~~Owner: `supabase login`~~ ✓ done (Step 22B).
2. Read-only migration history: `supabase migration list --linked` **or** `db query --linked` with `SELECT version, name FROM supabase_migrations.schema_migrations` — **requires link or db-url** (not done; owner forbade link on 22B).
3. Read-only SQL audit: RLS policies, grants, indexes, pg_cron — same constraint.
4. If clean → upgrade status to **A. READY_FOR_MIGRATIONS_ONLY**.

### Phase 1 — Migrations only (no Edge, no secrets, no rules enable, no Cron)

Apply in order (skip duplicate `20260714062253`):

1. `20260713194500_notification_system_foundation.sql` — **if** `20260712163000` confirmed applied; else apply RBAC first
2. `20260714120000_auth_first_login_foundation.sql`
3. `20260714130000_employee_provisioning_service_grants.sql`
4. `20260714140000_web_push_subscription_foundation.sql`
5. `20260714150000_web_push_delivery_tracking.sql`
6. `20260714160000_time_tracker_dispatch_grants.sql`

Post-migration verify: 4 `time_tracker.rule.*` rows, all `is_enabled=false`.

### Phase 2 — Edge Functions (guards off)

1. `manage-push-subscription`
2. `admin-create-employee`, `admin-list-employees`, `admin-update-employee`
3. `dispatch-time-tracker-notifications` (test flags false)
4. `run-time-tracker-notification-scheduler` (`TIME_TRACKER_SCHEDULER_ENABLED=false`)
5. **Skip** `send-test-web-push`

### Phase 3 — Secrets (names only, values owner-managed)

VAPID trio + scheduler secrets per `production-env-template.md`. All test/scheduler flags `false` initially.

### Phase 4 — Staged enablement (separate approvals)

Rules enable → real dispatch smoke → scheduler Cron → production scheduler enable.

---

## 20. Exact first write action

> **DO NOT RUN WITHOUT NEW OWNER APPROVAL**

Apply only `20260714200000_production_auth_bridge_phase1.sql` as first production write — **not** notification migrations, **not** `20260714120000`, **not** provisioning, **not** frontend deploy.

> **DO NOT RUN WITHOUT NEW OWNER APPROVAL**

---

## 21. Audit execution log

| Step | Action | Production modified |
|------|--------|---------------------|
| Local git check | `6648b3d`, `main`, clean | no |
| CLI auth check (22A) | token missing | no |
| CLI auth check (22B) | `projects list` success | no |
| Project ref confirm | HTTP header + JWT ref + CLI | no |
| Table/column probes | PostgREST HEAD/GET `limit=0` | no |
| Edge function probe | OPTIONS/GET 404 + CLI `functions list` | no |
| Secrets probe | CLI `secrets list` (names only) | no |
| Migration list | blocked (no link) | no |
| Audit doc written | this file | no (local only) |

**Production state: unchanged.**

---

## 22. Authenticated CLI audit — Step 22B

**Date:** 2026-07-14
**CLI version:** `2.109.1`  
**Owner action:** `npm exec --yes supabase@2.109.1 login` — success  
**Constraints honored:** no `supabase link`, no production writes, no secret values printed.

### 22.1 CLI login status

| Check | Result |
|-------|--------|
| `projects list` | **success** — returns 2 projects |
| Access token printed | **no** |
| `supabase/.temp/project-ref` | **absent** (not linked) |

### 22.2 Confirmed project ref

| Field | Value | Source |
|-------|-------|--------|
| ref | `cxadzerxndlscwvdaymk` | confirmed_by_cli |
| name | `shugyla-academy` | confirmed_by_cli |
| region | `ap-northeast-2` | confirmed_by_cli |
| status | `ACTIVE_HEALTHY` | confirmed_by_cli |
| Postgres | `17.6.1.141` (engine 17) | confirmed_by_cli |
| organization | `qdwgubekqmnggldjzlor` | confirmed_by_cli |
| API hostname | `https://cxadzerxndlscwvdaymk.supabase.co` | confirmed_by_cli |
| linked | `false` | confirmed_by_cli |

Other project in org: `dakeci-space` (`sqjkmgjobayksliruean`, INACTIVE) — **not used**.

### 22.3 Edge Functions (CLI)

Command: `supabase functions list --project-ref cxadzerxndlscwvdaymk -o json`

**Result:** `[]` (zero deployed functions)

| Function | Status | verify_jwt |
|----------|--------|------------|
| `admin-create-employee` | not_deployed | n/a |
| `admin-list-employees` | not_deployed | n/a |
| `admin-update-employee` | not_deployed | n/a |
| `manage-push-subscription` | not_deployed | n/a |
| `send-test-web-push` | not_deployed | n/a |
| `dispatch-time-tracker-notifications` | not_deployed | n/a |
| `run-time-tracker-notification-scheduler` | not_deployed | n/a |

No versions, timestamps, or function code retrieved.

### 22.4 Secret names (CLI)

Command: `supabase secrets list --project-ref cxadzerxndlscwvdaymk`

**Result:** `{"secrets":[]}` — all 10 checked names **missing**. No values, digests, or timestamps recorded.

### 22.5 Migration history availability

`supabase migration list --help` flags: `--linked`, `--local`, `--db-url`, `--password`. **No `--project-ref`.**

Attempted `supabase migration list` (no flags): `Cannot find project ref. Have you run supabase link?`

**Conclusion:** `migration_history = unavailable_without_link_or_database_access`

**Not attempted (forbidden or requires credentials):** `--linked`, `--db-url`, `--password`, `supabase link`.

### 22.6 RLS / grants / Cron CLI availability

| Capability | CLI command | Remote without link? |
|------------|-------------|----------------------|
| RLS policies | none dedicated | **no** |
| Grants | none dedicated | **no** |
| Extensions / pg_cron | none dedicated | **no** |
| Migration history | `migration list` | **no** (needs link/db-url) |
| DB stats / table counts | `inspect db *` | **no** (needs `--linked` or `--db-url`) |
| SQL query | `db query` | **no** (needs `--linked` or `--db-url`) |

**Classification:**

| Data | Source |
|------|--------|
| Project metadata, functions, secrets | **confirmed_by_cli** |
| Table/column existence, counts | **inferred_from_postgrest** (Step 22A) |
| `schema_migrations`, RLS SQL, grants, pg_cron | **unavailable_without_sql_access** |

### 22.7 Local migration comparison (notification rollout order)

| Local migration | Status | Notes |
|-----------------|--------|-------|
| `20260712163000_complete_flexible_rbac.sql` | **inferred_applied** | `roles`/`permissions`/`schedule.edit` in production |
| `20260713194500_notification_system_foundation.sql` | **inferred_missing** | no `notification_*` tables; no `auth_user_id` |
| `20260714120000_auth_first_login_foundation.sql` | **inferred_missing** | legacy `password` column; no auth-first RLS |
| `20260714130000_employee_provisioning_service_grants.sql` | **inferred_missing** | grants not visible via PostgREST |
| `20260714140000_web_push_subscription_foundation.sql` | **inferred_missing** | table 404 |
| `20260714150000_web_push_delivery_tracking.sql` | **inferred_missing** | depends on prior migrations |
| `20260714160000_time_tracker_dispatch_grants.sql` | **inferred_missing** | grant not inferable |
| `20260714062253_web_push_delivery_tracking.sql` | **duplicate_skip_candidate** | see §22.8 |

No **conflict** detected between local files and inferred production state.

### 22.8 Duplicate delivery migration analysis

Compared local files (read-only, no modifications):

| File | Size | Content |
|------|------|---------|
| `20260714062253_web_push_delivery_tracking.sql` | **0 bytes** | **empty** |
| `20260714150000_web_push_delivery_tracking.sql` | 85 lines | full migration |

**Canonical file:** `20260714150000_web_push_delivery_tracking.sql`

**Objects in canonical file only:**

- ALTER `notification_deliveries`: `request_id`, `provider`, `provider_status_code`, `next_retry_at`, `updated_at`
- CHECK constraints: `channel` (`in_app`, `push`, `web_push`), `status` (11 values), `failed_at` required on failure statuses
- UNIQUE index: `idx_notification_deliveries_request_subscription` on `(request_id, subscription_id)` partial
- INDEX: `idx_notification_deliveries_request_id` partial
- TRIGGER: `notification_deliveries_updated_at` → `academy_set_updated_at()`
- FUNCTION + implied trigger hook: `notification_deliveries_require_push_subscription()`
- `notify pgrst, 'reload schema'`

**Conclusion:** `20260714062253` is an **empty stub**, not a content duplicate. **Exclude from apply order permanently** unless file is intentionally populated later. **No conflict** with canonical migration.

### 22.9 Still unconfirmed without SQL access

- Exact `supabase_migrations.schema_migrations` rows and `applied_at`
- Production-only migrations not present locally
- RLS policy names/commands on `academy_users` and other tables
- `GRANT` statements and `service_role` shift access
- `pg_cron` extension and job definitions
- UNIQUE `(employee_id, shift_date)` constraint on shifts
- SQL functions referencing `password`

### 22.10 Rollout readiness change (22B)

**Remains: B. READY_WITH_BLOCKERS**

Upgraded confidence on: project identity, Edge Functions (none), secrets (none), empty duplicate file.

Still blocked on: exact migration history, RLS/grants/Cron before first write (unless owner accepts inferred state).

### 22.11 First future write action (unchanged)

> **DO NOT RUN WITHOUT NEW OWNER APPROVAL**

Apply only `20260713194500_notification_system_foundation.sql` as first write — after owner confirms `20260712163000` is applied (currently inferred). No Edge deploy, no secrets, no rule enable, no Cron. Skip empty `20260714062253`.

Apply only `20260714200000_production_auth_bridge_phase1.sql` as first production write — after owner approval. No Auth user creation, no grant revoke, no frontend/functions deploy, no notification migrations.

> **Superseded:** Phase 1 applied in production as `20260714172032`. Next write: provisioning `--dry-run` only.

**Date:** 2026-07-14
**Status:** local preparation only. **No production changes.**

### 23.1 Production Auth exposure (at Step 22C planning)

| Finding | Value (pre–Phase 1) | After Phase 1 apply |
|---------|---------------------|---------------------|
| `academy_users` rows | 17 | 17 |
| `auth_user_id` column | absent | **present**, nullable |
| Linked `auth_user_id` | n/a | **0** |
| Legacy non-empty `password` | 17 | 17 |
| Permissive anon policies | present | **preserved** |

### 23.2 Local artifacts prepared

| Artifact | Purpose |
|----------|---------|
| `20260714200000_production_auth_bridge_phase1.sql` | Additive bridge only |
| `20260714210000_production_auth_security_cutover_phase2.sql` | Security cutover with preconditions |
| `20260714220000_production_legacy_password_cleanup_phase3.sql` | Password clear (HIGH RISK) |
| `scripts/production-auth-users-migration.mjs` | Provisioning tool |
| `scripts/verify-production-auth-cutover.mjs` | Local verification |
| `docs/auth/production-auth-cutover-plan.md` | Phased plan |
| `docs/auth/production-auth-rollout-checklist.md` | Owner approval gates |

### 23.3 Readiness

**NOT_READY_FOR_DIRECT_NOTIFICATION_DEPLOY** — Auth cutover must precede notification rollout.

---

## 24. Phase 1 production apply — Step 22E sync

**Date:** 2026-07-14
**Status:** Phase 1 applied in production. Local migration file synced to production apply order.

### 24.1 Production migration

| Field | Value |
|-------|-------|
| Applied version | `20260714172032` (`production_auth_bridge_phase1`) |
| Local canonical file | `20260714200000_production_auth_bridge_phase1.sql` |
| First attempt | Failed — function before column |
| Rollback | Complete |
| Second attempt | Success |

### 24.2 Post-apply production state

| Check | Value |
|-------|-------|
| `auth_user_id` | exists, nullable |
| FK | `ON DELETE SET NULL` |
| Partial UNIQUE index | present |
| Helper functions | both present |
| `academy_users` total | 17 |
| Linked `auth_user_id` | **0** |
| Legacy passwords nonempty | 17 |
| Legacy policies / anon grants | preserved |
| Auth users created | none |
| Notifications / functions / secrets / Cron | untouched |

### 24.3 Local fix (Step 22E)

Reordered local SQL: `employee_owned_by_current_auth()` now created **after** `auth_user_id` + FK + index. No semantic changes.

### 24.4 Next production write

> **DO NOT RUN WITHOUT NEW OWNER APPROVAL**

Auth provisioning `--dry-run` only — no user create/change until owner reviews aggregate report.

---

## 25. Phase B production Auth provisioning — Step 22F

**Date:** 2026-07-14
**Status:** Production Auth provisioning **completed**. Phase 2, deploy, notifications, and Cron **not** performed.

### 25.1 Owner approval

Owner explicitly confirmed: link 1 existing Auth user, create 16 Auth users, fill `auth_user_id`. No grant revoke, deploy, Phase 2, notification migrations, or Cron.

### 25.2 Pre-apply verification

| Check | Value |
|-------|-------|
| `academy_users` total | 17 |
| Linked `auth_user_id` | 0 |
| `auth.users` total | 1 |
| Legacy passwords nonempty | 17 |
| Dry-run `existingAuthMatches` | 1 |
| Dry-run `wouldCreateAuthUsers` | 16 |
| Dry-run `conflicts` | 0 |
| Active / inactive | 9 / 8 |
| Phase 1 objects | present (from Step 22E) |
| Legacy policies / anon grants | preserved |
| Notification tables | absent |
| Edge Functions / secrets / Cron | none |

### 25.3 Post-apply production state

| Check | Value |
|-------|-------|
| Production provisioning | **completed** |
| Existing Auth user linked | **1** |
| New Auth users created | **16** |
| Academy users linked | **17 / 17** |
| Active linked | **9 / 9** |
| Inactive linked | **8 / 8** |
| Conflicts / duplicate emails | **0** |
| `auth.users` total | **17** (was 1) |
| Distinct `auth_user_id` | **17** |
| Legacy passwords nonempty | **17** |
| Employee status counts | active **9**, inactive/other **8** (unchanged) |
| Legacy policies / anon grants | **preserved** |
| Auth health | 17 email identities; 17 confirmed; 0 deleted; 0 anonymous; 0 orphan links |
| Phase 2 | **not applied** |
| Notification tables | **still absent** |
| Edge Functions | **0** |
| Secrets | **0** |
| Cron | **not configured** |
| Deploy | **not performed** |

### 25.4 Next production write

> **DO NOT RUN WITHOUT NEW OWNER APPROVAL**

Deploy Auth-first **admin Edge Functions only** (`admin-create-employee`, `admin-list-employees`, `admin-update-employee`). No frontend deploy, no Phase 2, no notification migrations.

---

## 26. Employee admin Edge Functions deploy — Step 22H

**Date:** 2026-07-14
**Status:** Three employee administration Edge Functions **deployed**. Frontend, Phase 2, notifications, and Cron **not** performed.

### 26.1 Owner approval

Owner confirmed deploy of `admin-create-employee`, `admin-list-employees`, `admin-update-employee` only. No frontend, Phase 2, notification migrations, secrets, or Cron.

### 26.2 Pre-deploy state

| Check | Value |
|-------|-------|
| Edge Functions | **0** |
| Prior failed deploy attempts | no functions created (missing source) |

### 26.3 Post-deploy state

| Check | Value |
|-------|-------|
| Edge Functions deployed | **3** |
| Functions | `admin-create-employee`, `admin-list-employees`, `admin-update-employee` |
| Status | all **ACTIVE** |
| `verify_jwt` | **true** on all three |
| Unauthorized smoke (no JWT) | **401** on all three |
| `academy_users` total / linked | **17 / 17** |
| `auth.users` total | **17** |
| Legacy passwords | **17** nonempty |
| Legacy policies / anon grants | **preserved** |
| Phase 2 | **not applied** |
| Notification tables | **absent** |
| Manual secrets set/unset | **none** |
| Cron | **not configured** |
| Frontend deploy | **not performed** |
| Authenticated smoke | **not performed** |

### 26.4 Next production write

> **DO NOT RUN WITHOUT NEW OWNER APPROVAL**

Authenticated smoke test of three deployed admin Edge Functions from an active administrator JWT. No frontend deploy, no Phase 2.

---

## 27. Production auth drift audit — Step 22J

**Date:** 2026-07-15
**Status:** Read-only audit completed. **No production mutations.**

### 27.1 Drift summary

| Metric | Expected (post-22F) | Actual |
|--------|---------------------|--------|
| `academy_users` | 17 | **18** |
| linked | 17 | 17 |
| unlinked | 0 | **1** |
| active | 9 | **10** |
| inactive/terminated | 8 | 8 |
| `auth.users` | 17 | 17 |
| legacy passwords nonempty | 17 | **18** |

### 27.2 Step 22I outcome

Authenticated smoke test **correctly blocked** at baseline verification (`academyUsers` 18 vs expected 17). No Auth sign-in, no Edge Function calls.

### 27.3 Unlinked employee (safe characteristics only)

- status: **active**
- role code: **seller**
- `created_at` / `updated_at`: present (date **2026-07-14**)
- login / password / `role_id`: all filled
- Auth technical-email match: **0**
- duplicate technical email: **false**
- related records: **1** shift; **0** course assignments; **0** attendance

### 27.4 Source classification

**likely_created_via_legacy_frontend**

Evidence: missing `auth_user_id` (Edge create would populate); legacy anon access preserved; no auto-insert trigger on `academy_users`; Edge function logs not available via CLI for invocation count.

### 27.5 Provisioning dry-run (read-only)

```json
{
  "academyUsers": 18,
  "alreadyLinked": 17,
  "existingAuthMatches": 0,
  "wouldCreateAuthUsers": 1,
  "conflicts": 0,
  "activeUsers": 10,
  "inactiveUsers": 8,
  "ready": true
}
```

### 27.6 System status (unchanged)

- Edge Functions: **3** ACTIVE, `verify_jwt=true`
- Frontend: **legacy**
- Phase 2: **not applied**
- Notification tables: **absent**
- Cron: **not configured**

### 27.7 Target baseline (before frontend / 22I retry)

`academy_users=18`, linked=**18**, unlinked=**0**, active linked=**10/10**, `auth.users=18`, conflicts=**0**.

### 27.8 Next production write

> **DO NOT RUN WITHOUT NEW OWNER APPROVAL**

Create **1** missing Auth user and link the single unlinked `academy_user` via targeted provisioning `--apply`. No frontend, Phase 2, grants, or notification changes.

---

## 28. Single-user auth reconciliation — Step 22K

**Date:** 2026-07-15
**Status:** One-user provisioning **completed**. Reconciled baseline **18/18** achieved.

### 28.1 Owner confirmation

Drift cause accepted: new employee manually added via legacy frontend after Step 22F. Business record retained — not deleted.

### 28.2 Pre-apply state

| Metric | Value |
|--------|-------|
| `academy_users` | 18 |
| linked | 17 |
| unlinked | 1 (active, role `seller`) |
| `auth.users` | 17 |
| dry-run | `wouldCreateAuthUsers=1`, `conflicts=0`, `ready=true` |

### 28.3 Post-apply state

| Metric | Value |
|--------|-------|
| New Auth users created | **1** |
| Academy users linked | **18 / 18** |
| Active linked | **10 / 10** |
| Inactive linked | **8 / 8** |
| Unlinked | **0** |
| `auth.users` | **18** |
| Conflicts / orphans / duplicates | **0** |
| Email identities / confirmed | **18 / 18** |
| Legacy passwords nonempty | **18** |
| Legacy policies / anon grants | **preserved** |
| Edge Functions | **3** ACTIVE |
| Frontend | **legacy** |
| Phase 2 | **not applied** |
| Notifications / Cron | **untouched** |

### 28.4 Next production write

> **DO NOT RUN WITHOUT NEW OWNER APPROVAL**

Repeat Step 22I authenticated non-mutating smoke test against reconciled baseline 18/18. No frontend deploy, no Phase 2.
