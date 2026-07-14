# Employee admin list and update (local)

## Why Edge Functions

After Auth-first login, `authenticated` users may read only their own `academy_users` row (column-limited, no `password`). A broad `USING (true)` SELECT policy is not acceptable.

Admin employee management therefore runs through Edge Functions:

- `admin-list-employees` — paginated list with RBAC
- `admin-update-employee` — safe profile updates with RBAC

Both functions:

1. Verify the caller JWT via `auth.getUser()`.
2. Resolve the caller profile by `auth_user_id`.
3. Check permissions in `permissions` / `role_permissions` (never `user_metadata`).
4. Use `service_role` only server-side.

## Permissions

| Code | Purpose |
|------|---------|
| `employees.view` | List employees |
| `employees.edit` | Update allowed profile fields |
| `employees.create` | Create employee (provisioning function) |

`admin` and `administrator` roles receive all permissions via RBAC migration. Roles such as `cashier` do not receive view/edit employee permissions.

## Safe response fields

List and update responses include:

- `id`, `first_name`, `last_name`, `full_name`, `login`
- `role`, `role_id`, `status`, `position`, `avatar_url`
- `created_at`, `updated_at`
- `auth_linked` (boolean only)

Never returned to the browser:

- `password`
- `auth_user_id`
- tokens or service keys

## List function

**Endpoint:** `POST /functions/v1/admin-list-employees`

Allowed body fields: `page`, `page_size`, `search`, `status`, `role_id`, `sort_by`, `sort_direction`.

Defaults: `page=1`, `page_size=50`, `sort_by=full_name`, `sort_direction=asc`, max `page_size=100`.

Search sanitizes PostgREST filter characters. Sort columns are whitelisted.

Admin-role rows (`role = admin`) are excluded from the staff list.

## Update function

**Endpoint:** `POST /functions/v1/admin-update-employee`

Body:

```json
{
  "employee_id": 123,
  "changes": {
    "first_name": "...",
    "last_name": "...",
    "position": "...",
    "avatar_url": "...",
    "role_id": "uuid",
    "status": "active"
  }
}
```

`full_name` is recomputed server-side from first/last name.

### Forbidden in `changes`

`login`, `phone`, `email`, `password`, `temporary_password`, `auth_user_id`, `role`, `id`, timestamps, metadata.

Auth user email/password are not modified on this step.

### Protections

- **Self:** caller cannot change own `role_id` or `status` (`409`).
- **Last admin:** cannot remove the last active user with `employees.edit` via deactivation or role demotion (`409 last_admin_protected`).

## Frontend

Cloud mode:

- `EmployeesSection` loads via `listEmployeesForAdmin()`.
- Edit/deactivate/restore via `updateEmployeeAsAdmin()` (through `academyDataService` for update helpers).
- Login/password fields disabled on edit with explanatory hint.

Offline mode continues to use `localDataAdapter`.

Cloud function errors do not fall back to offline mode.

## Deactivation vs delete

Cloud deactivation sets `status` through the update function. Hard delete of employees is not used in cloud UI.

## Local verification

```bash
npm run supabase:local:bootstrap -- --reset
npm run supabase:local:verify-employee-admin-access
npm run supabase:local:verify-employee-provisioning
npm run supabase:local:verify-auth-first
npm run supabase:local:verify-notifications
npm run build
```

## Known limitation

Changing employee login, Auth email, phone, or password requires a separate Auth synchronization implementation. This step does not perform that sync.

## Production

Production has not been modified. All verification is local (`127.0.0.1`).

See also: [employee-auth-provisioning.md](./employee-auth-provisioning.md)
