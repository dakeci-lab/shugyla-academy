# Employee Auth Provisioning

## Why Edge Function

Creating an employee requires Supabase Auth Admin API (`auth.admin.createUser`), which must use **service_role**. The service role must never appear in the browser bundle.

The `admin-create-employee` Edge Function:

1. Validates the caller JWT.
2. Loads the caller `academy_users` profile by `auth_user_id`.
3. Checks RBAC permission `employees.create` in the database.
4. Creates `auth.users` with a server-computed technical email.
5. Inserts `academy_users` with `auth_user_id` linked.
6. Rolls back the Auth user if profile insert fails.

## Caller authorization

- `verify_jwt = true` in `supabase/config.toml`.
- Function additionally calls `auth.getUser()` on a user-scoped client.
- Caller profile must be **active** (`canEmployeeLogin` equivalent).
- Permission `employees.create` verified via `roles` / `permissions` / `role_permissions`.

Forbidden from client body: `role`, `status`, `auth_user_id`, `password`, `id`, etc.

## Request payload (allowed)

| Field | Required |
|---|---|
| `login` | yes |
| `temporary_password` | yes (min 6 chars) |
| `full_name` or `first_name` + `last_name` | yes |
| `role_id` | yes (UUID from `roles`) |
| `position`, `avatar_url` | optional |

## Technical email

Computed server-side using the same rules as `src/utils/phoneUtils.js` → `loginToTechnicalEmail()`.

Shared implementation: `supabase/functions/_shared/loginToTechnicalEmail.ts`.

## Related flows

- Admin list/update (view/edit employees): [employee-admin-access.md](./employee-admin-access.md)

## academy_users.password

- **Not** set to the temporary password.
- Insert omits `password` → default `''`.
- Only Supabase Auth stores the credential.

## Rollback

If `academy_users` INSERT fails after Auth user creation:

```
serviceClient.auth.admin.deleteUser(createdAuthUserId)
```

Logs contain category only — no passwords or tokens.

## Error codes

| HTTP | Code | Meaning |
|---|---|---|
| 401 | unauthorized | Missing/invalid JWT |
| 403 | forbidden | Inactive caller or no `employees.create` |
| 409 | conflict | Duplicate login or Auth email |
| 422 | validation_error | Invalid/forbidden fields |
| 500 | provisioning_error / rollback_failed | Server provisioning failure |

## Frontend

- Cloud: `createEmployeeWithAuth()` → `supabase.functions.invoke('admin-create-employee')`.
- Offline: existing `localDataAdapter.createEmployee()` unchanged.
- UI label in cloud mode: **«Временный пароль»**.

## Local verification

```bash
npm run supabase:local:bootstrap -- --reset
npm run supabase:local:verify-employee-provisioning
npm run supabase:local:verify-auth-first
npm run supabase:local:verify-notifications
```

Function URL (local): `http://127.0.0.1:54321/functions/v1/admin-create-employee`

## Not implemented yet

- Production deploy of Edge Function
- Admin employee list RLS policy
- Password reset / forced change
- Legacy Auth user migration
- Login/email synchronization on edit
- Auth user deletion on deactivation

See also: [Auth-first login](./auth-first-login.md)
