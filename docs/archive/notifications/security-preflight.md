# Security Preflight

**Status:** local scan of tracked files. No production connection.

## Scan summary (tracked files)

| Pattern | Finding | Risk |
|---------|---------|------|
| `SUPABASE_SERVICE_ROLE` in `src/` | **Absent** | OK |
| `VAPID_PRIVATE_KEY` in `src/` / `public/` | **Absent** | OK |
| `TIME_TRACKER_SCHEDULER_SECRET` in Git | **Absent** (names in docs/scripts only) | OK |
| `cxadzerxndlscwvdaymk` (production ref) | Present in **guards/blocklists only** | OK |
| `supabase.co` | Present in **guards/blocklists only** | OK |
| `select('*')` in notification Edge/shared code | **Absent** in new notification functions | OK |
| Env files tracked | `.env.local`, `supabase/functions/.env`, `.local-secrets/` **gitignored** | OK |

## Logging

- Scheduler auth: no secret/signature logging in function or invoker
- Edge error responses: generic codes only (`unauthorized`, `internal_error`)
- Verify scripts: fingerprints only, not full keys

## Legacy `academy_users.password`

### Current state

| Area | Status |
|------|--------|
| Cloud login (`src/utils/auth.js`) | **Auth-first** — `signInWithPassword` only; no browser password compare |
| `supabaseDataAdapter.authenticateUser` | **Deprecated** — marked unused for Auth-first cloud login |
| Offline mode (`employeeData.authenticateEmployee`) | Still compares `user.password` — local-only legacy |
| `academy_users.password` column | **Still exists** in schema (technical debt) |
| New employee provisioning | Auth user created via Edge Function; temp password not stored in `academy_users.password` for new flow |

### Technical debt

- Column `academy_users.password` remains in DB for legacy/offline compatibility
- Admin UI may still send `password` field on employee create/update — handled by Edge provisioning, not stored as plaintext auth secret for login
- **Recommendation (post-deploy):** migration to drop or null out `password` column after all employees migrated to Auth

## Academy admin functions

- JWT + RBAC enforced on admin Edge Functions
- `service_role` used only inside Edge runtime (platform env), never in frontend

## Scheduler security

- HMAC via `crypto.subtle.verify`
- No JWT on scheduler function
- DB access only after HMAC success
- `rulesOverride` not exposed via HTTP

## Remaining risks

1. `send-test-web-push` deployed without `WEB_PUSH_TEST_ENABLED=false` guard
2. Scheduler enabled before rules pilot and monitoring
3. Legacy offline login path if cloud misconfigured to offline mode
