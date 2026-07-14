# Employee Admin Edge Functions — Production Deploy Preflight

**Date:** 2026-07-14  
**Step:** 22G  
**Status:** Preflight complete. **No production deploy performed.**

Related: [production-auth-cutover-plan.md](./production-auth-cutover-plan.md), [production-auth-rollout-checklist.md](./production-auth-rollout-checklist.md)

---

## 1. Functions in scope

| Function | Purpose | Permission |
|----------|---------|------------|
| `admin-create-employee` | Create Auth user + `academy_users` row with `auth_user_id` | `employees.create` |
| `admin-list-employees` | Paginated, filtered employee list (safe fields only) | `employees.view` |
| `admin-update-employee` | Whitelist profile/role/status updates | `employees.edit` |

**Out of scope for this deploy:** frontend (GitHub Pages), Phase 2 SQL, notification migrations, Web Push, scheduler, Cron, custom secrets.

---

## 2. verify_jwt configuration

All three functions in `supabase/config.toml`:

| Function | `verify_jwt` | `enabled` |
|----------|--------------|-----------|
| `admin-create-employee` | **true** | true |
| `admin-list-employees` | **true** | true |
| `admin-update-employee` | **true** | true |

Platform JWT gate runs before handler. Handlers additionally call `auth.getUser()` via anon client + Bearer token and resolve caller through `academy_users.auth_user_id`.

---

## 3. RBAC permissions

Authorization via `authorizeEmployeeAdmin()` in `_shared/employeeAuthorization.ts`:

- JWT validated with `userClient.auth.getUser()` (not `user_metadata`).
- Caller resolved: `academy_users` row where `auth_user_id = auth.uid()`.
- Caller must be **active** (`canEmployeeLogin`).
- Permission checked against `permissions` + `role_permissions` tables.

| Function | Permission code |
|----------|-----------------|
| `admin-create-employee` | `employees.create` |
| `admin-list-employees` | `employees.view` |
| `admin-update-employee` | `employees.edit` |

Inactive caller → **403** (`inactive_caller`). Staff without permission → **403** (`forbidden`).

**Note:** Role assignment on create validates target role exists and is active; caller must hold `employees.create`. Fine-grained “assign only roles you hold” is not implemented — acceptable for current RBAC model.

---

## 4. Required environment (Supabase-managed)

Automatically injected by Supabase at runtime — **no custom secrets required**:

| Variable | Usage |
|----------|-------|
| `SUPABASE_URL` | Client creation |
| `SUPABASE_ANON_KEY` | JWT validation via `auth.getUser()` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side DB/Auth Admin API only |

Custom secrets (VAPID, scheduler tokens, etc.) **not required** for these three functions.

---

## 5. Deploy order

1. `admin-create-employee`
2. `admin-list-employees`
3. `admin-update-employee`

Deploy command (after owner approval only):

```bash
supabase functions deploy admin-create-employee --project-ref cxadzerxndlscwvdaymk
supabase functions deploy admin-list-employees --project-ref cxadzerxndlscwvdaymk
supabase functions deploy admin-update-employee --project-ref cxadzerxndlscwvdaymk
```

**Do not deploy** other functions, frontend, or run SQL on this step.

---

## 6. Deploy bundle / file list

Each function bundle includes entrypoint, import map, and shared dependencies resolved at deploy time.

### admin-create-employee

| File | Role |
|------|------|
| `supabase/functions/admin-create-employee/index.ts` | Entrypoint |
| `supabase/functions/admin-create-employee/deno.json` | Import map |
| `supabase/functions/_shared/employeeAuthorization.ts` | Auth + RBAC |
| `supabase/functions/_shared/employeeFields.ts` | Field helpers |
| `supabase/functions/_shared/loginToTechnicalEmail.ts` | Technical email |
| `supabase/functions/_shared/cors.ts` | CORS + JSON responses |

### admin-list-employees

| File | Role |
|------|------|
| `supabase/functions/admin-list-employees/index.ts` | Entrypoint |
| `supabase/functions/admin-list-employees/deno.json` | Import map |
| `supabase/functions/_shared/employeeAuthorization.ts` | Auth + RBAC |
| `supabase/functions/_shared/employeeFields.ts` | Safe select + mapping |
| `supabase/functions/_shared/cors.ts` | CORS + JSON responses |

### admin-update-employee

| File | Role |
|------|------|
| `supabase/functions/admin-update-employee/index.ts` | Entrypoint |
| `supabase/functions/admin-update-employee/deno.json` | Import map |
| `supabase/functions/_shared/employeeAuthorization.ts` | Auth + RBAC + last-admin guard |
| `supabase/functions/_shared/employeeFields.ts` | Safe select + mapping |
| `supabase/functions/_shared/cors.ts` | CORS + JSON responses |

No test fixture logic, no localhost-only dependencies, no hardcoded credentials in these three functions.

---

## 7. Safety summary

### admin-create-employee

- Auth user via `auth.admin.createUser()` only; `email_confirm: true`; no invitation email.
- Legacy `academy_users.password` **not** written (Auth-only password).
- Temporary password never logged; forbidden body keys include `password`, `auth_user_id`, `user_metadata`.
- DB insert failure → `auth.admin.deleteUser()` rollback.
- Duplicate login / Auth email → **409**.
- Response: employee safe fields + `auth_user_id` (no JWT, no service key, no password).

### admin-list-employees

- Explicit `SAFE_EMPLOYEE_SELECT` — no `password`.
- `mapSafeEmployee()` strips `auth_user_id` → `auth_linked: boolean`.
- Pagination/sort/filter validated; extra fields → **422**.
- Raw DB errors → generic **500** (`internal_error`).

### admin-update-employee

- Whitelist: `first_name`, `last_name`, `position`, `avatar_url`, `role_id`, `status`.
- Forbidden: `login`, `password`, `auth_user_id`, `user_metadata`, etc.
- Self role/status change → **409**.
- Last active editor protection → **409** (`last_admin_protected`).
- Deactivation updates `status` only — does not delete Auth user.
- Response via `mapSafeEmployee()` — no password.

---

## 8. Post-deploy smoke tests (manual, after owner approval)

Use permitted admin JWT against production function URLs:

1. **List:** POST `admin-list-employees` with `{ "page": 1, "page_size": 10 }` → 200, no password in JSON.
2. **Update:** POST `admin-update-employee` with safe field change on test employee → 200.
3. **Create:** POST `admin-create-employee` with disposable test login → 201; verify Auth user + `auth_user_id`; clean up test row manually if needed.
4. **Authz:** Staff JWT without permission → 403; inactive admin → 403; no JWT → 401.

**Do not** mass-invoke or switch frontend to these endpoints until separate frontend deploy approval.

---

## 9. Rollback

If a deployed function misbehaves:

1. Delete or redeploy previous version via Supabase dashboard/CLI.
2. **Do not** modify existing Auth users or `academy_users.auth_user_id`.
3. **Do not** apply Phase 2 security cutover as rollback.
4. Frontend remains on legacy anon path until explicitly approved.

---

## 10. Frontend status

Production frontend (GitHub Pages) **remains legacy** — uses anon + legacy password path. Deployed Edge Functions are infrastructure-only until frontend switches to `functions.invoke` for employee admin.

---

## 11. Local verification (Step 22G)

All exit code 0:

- `npm run supabase:local:verify-production-auth-cutover`
- `npm run supabase:local:verify-auth-first`
- `npm run supabase:local:verify-employee-provisioning`
- `npm run supabase:local:verify-employee-admin-access`
- `npm run build`

Static scan: `service_role` absent in `src/`; no `select('*')` in the three functions; `user_metadata` not used for RBAC authority.

---

## 12. Production mutation status

**None** on Step 22G. Production Auth provisioning (Step 22F) unchanged. Edge Functions count remains **0** until explicit deploy approval.
