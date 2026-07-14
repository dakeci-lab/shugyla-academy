# Production Auth Cutover Plan

**Status:** local preparation only. **No production actions on this document.**

Related: [production-auth-rollout-checklist.md](./production-auth-rollout-checklist.md), [../notifications/production-readonly-audit.md](../notifications/production-readonly-audit.md)

## Production risk summary

| Finding | Impact |
|---------|--------|
| 17 `academy_users`, 9 active | All must retain login ability through cutover |
| 17 non-empty legacy `password` | Current frontend uses anon + plaintext password |
| 1 `auth.users` row | Only 1 employee can use Auth today |
| `auth_user_id` absent | No Auth-first link column in production |
| Permissive `FOR ALL USING(true)` on `academy_users`, `academy_employee_shifts` | Public read/write via anon |
| Anon has SELECT/INSERT/UPDATE/DELETE/TRUNCATE | Critical exposure |
| Notification tables absent | Notification rollout must follow Auth cutover |

**Direct Auth-first deploy is unsafe** — up to 16 employees lose login; security cutover before provisioning locks everyone out.

---

## Existing migration analysis

| Migration | Adds `auth_user_id` | Revokes anon | Drops legacy policy | Creates Auth users | Safe alone on production |
|-----------|---------------------|--------------|---------------------|--------------------|--------------------------|
| `20260713194500_notification_system_foundation.sql` | yes + backfill | no | no | no | **no** — creates entire notification system |
| `20260714120000_auth_first_login_foundation.sql` | no (expects column) | **yes** | **yes** | no | **no** — breaks legacy frontend immediately |
| `20260714130000_employee_provisioning_service_grants.sql` | no | no | no | no | yes (grants only) — needs Edge deploy |

### Answers

1. **Which adds `auth_user_id`?** — `20260713194500` (bundled with notifications) or new `20260714200000_production_auth_bridge_phase1.sql`.
2. **Which revokes anon?** — `20260714120000` and new Phase 2.
3. **Which removes legacy policies?** — `20260714120000` and new Phase 2.
4. **Breaks current frontend?** — `20260714120000` yes; Phase 1 no; Phase 2 yes (after Auth deploy).
5. **Depends on existing `auth.users`?** — backfill in `20260713194500` links unambiguous email matches only.
6. **Backfill `auth_user_id`?** — notification migration SQL backfill; production needs provisioning tool for remaining users.
7. **Creates Auth users?** — no migration creates Auth users (expected).
8. **Split required?** — **yes**. Phase 1 additive bridge + provisioning + Phase 2 cutover + Phase 3 password cleanup.

---

## Phase A — Additive bridge (SQL)

**File:** `supabase/migrations/20260714200000_production_auth_bridge_phase1.sql`

1. Production backup (owner).
2. Add nullable `academy_users.auth_user_id`.
3. FK → `auth.users(id) ON DELETE SET NULL`.
4. Partial UNIQUE index on non-null `auth_user_id`.
5. `auth_private.login_to_technical_email()` + `employee_owned_by_current_auth()` helpers.
6. **Keep** legacy login working (no policy/grant changes).
7. **Do not** clear `password`.

> **DO NOT RUN WITHOUT NEW OWNER APPROVAL**

---

## Phase B — Auth user provisioning (tool)

**File:** `scripts/production-auth-users-migration.mjs`

Modes: `--dry-run`, `--apply`, `--status`

1. Link existing Auth user where technical email matches.
2. Create missing Auth users via Admin API (server-side `service_role` from env only).
3. Use `loginToTechnicalEmail()` algorithm.
4. Idempotent; no duplicate Auth users; conflicts = blocker.
5. Set `academy_users.auth_user_id` after create/link.
6. Legacy `password` used only inside `createUser` request — never logged.
7. Inactive users: create/link but frontend blocks login by `status`.
8. No automatic email delivery.

Verify counts before Phase C:

```json
{
  "academyUsers": 17,
  "alreadyLinked": 17,
  "existingAuthMatches": 1,
  "wouldCreateAuthUsers": 0,
  "conflicts": 0,
  "inactiveUsers": 8,
  "ready": true
}
```

---

## Phase C — Auth-first deploy

1. Deploy `admin-create-employee`, `admin-list-employees`, `admin-update-employee`.
2. Deploy Auth-first frontend (GitHub Pages).
3. Smoke-test login: admin, cashier, procurement/receiver, inactive blocked.
4. Session restore + logout.

---

## Phase D — Security cutover (SQL)

**File:** `supabase/migrations/20260714210000_production_auth_security_cutover_phase2.sql`

**Preconditions:** Phase 1 applied; every **active** `academy_user` has `auth_user_id`; Phase C smoke passed.

1. Drop `"Allow anon read write academy_users"`.
2. Drop `"Allow anon read write academy_employee_shifts"`.
3. REVOKE anon DML/TRUNCATE on users, shifts, assignments, RBAC catalog.
4. Own-profile SELECT policy on `academy_users`.
5. Own-shift SELECT policy on `academy_employee_shifts`.
6. Authenticated read-only RBAC catalog.
7. Column-level grant excludes `password` from authenticated.
8. `service_role` retains full access for Edge Functions.

> **DO NOT RUN WITHOUT NEW OWNER APPROVAL**

---

## Phase E — Password retirement (SQL)

**File:** `supabase/migrations/20260714220000_production_legacy_password_cleanup_phase3.sql`

**HIGH RISK / DO NOT RUN YET**

Preconditions: Phase D stable; owner explicit approval.

1. `UPDATE academy_users SET password = ''` (not DROP column).
2. Prepare password reset flow for staff separately.

---

## Production vs local dev paths

| Path | Migrations |
|------|------------|
| **Local dev (existing)** | `20260713194500` + `20260714120000` + notifications |
| **Production Auth cutover** | `20260714200000` → provisioning → deploy → `20260714210000` → later `20260714220000` |
| **Production notifications (later)** | `20260713194500` … after Auth cutover stable |

`20260714120000` is **not** applied to production when using phased cutover — Phase 2 supersedes it for security semantics.

---

## Rollout readiness

**NOT_READY_FOR_DIRECT_NOTIFICATION_DEPLOY**

Required coordinated Auth cutover before notification migrations or Auth-first frontend alone.
