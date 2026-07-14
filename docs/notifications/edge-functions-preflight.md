# Edge Functions Preflight

**Status:** planning only. No deploy.

## Functions overview

| Function | Production needed | verify_jwt | Additional auth | Required env | Publicly callable | Test guards | Initial production state | Deploy order |
|----------|-------------------|------------|-----------------|--------------|-------------------|-------------|--------------------------|--------------|
| `manage-push-subscription` | **Yes** | `true` | `authorizeAuthenticatedEmployee` — subscription owned by auth user | Platform Supabase URL/keys; no VAPID | No — JWT required | None | **Enabled** | 1 |
| `send-test-web-push` | **No** (default) | `true` | JWT + local test guard | `WEB_PUSH_TEST_ENABLED`, VAPID trio | No — JWT + guard | `WEB_PUSH_TEST_ENABLED !== 'true'` → disabled | **Disabled** or not deployed | — |
| `admin-create-employee` | **Yes** | `true` | RBAC admin + `service_role` internal | Supabase keys | No | None | Enabled (existing) | 2 |
| `admin-list-employees` | **Yes** | `true` | RBAC admin | Supabase keys | No | None | Enabled (existing) | 2 |
| `admin-update-employee` | **Yes** | `true` | RBAC admin | Supabase keys | No | None | Enabled (existing) | 2 |
| `dispatch-time-tracker-notifications` | **Optional** | `true` | JWT + `schedule.edit` RBAC | VAPID (if real push); test flags | No — JWT required | See below | **Test flags false** | 3 |
| `run-time-tracker-notification-scheduler` | **Yes** | `false` | **HMAC mandatory** (`schedulerRequestAuth`) | Scheduler secrets; VAPID; `TIME_TRACKER_SCHEDULER_ENABLED` | No — HMAC only | See below | **Disabled** (`ENABLED=false`) | 4 |

## Critical checks

### `send-test-web-push`

- Production default: **`WEB_PUSH_TEST_ENABLED=false`** or function not deployed
- Must not expose test push flow to production users
- JWT required even when enabled locally

### `dispatch-time-tracker-notifications`

- Local/manual admin endpoint for dry-run and guarded real dispatch
- Production defaults:
  - `TIME_TRACKER_DISPATCH_TEST_ENABLED=false`
  - `TIME_TRACKER_DISPATCH_REAL_TEST_ENABLED=false`
- Without test flags, returns `dispatcher_disabled` / `real_dispatch_disabled`
- Real production dispatch should go through scheduler + enabled rules, not this admin endpoint

### `run-time-tracker-notification-scheduler`

- **`verify_jwt=false`** only for this function (HMAC replaces JWT)
- Production defaults:
  - `TIME_TRACKER_SCHEDULER_ENABLED=false` on first deploy
  - `TIME_TRACKER_SCHEDULER_TEST_MODE=false`
- `x-shugyla-scheduler-test-run-at` header **forbidden** in hosted/production (422)
- Request body: `{}` only; HMAC on raw bytes
- Cron caller signs requests; no JWT, no `service_role` in request

### `manage-push-subscription`

- JWT required (`verify_jwt=true`)
- Subscription rows tied to `auth_user_id` of caller
- Device ownership enforced server-side

## Deployment order

1. `manage-push-subscription`
2. Admin functions (`admin-create-employee`, `admin-list-employees`, `admin-update-employee`)
3. `dispatch-time-tracker-notifications` (disabled test flags)
4. `run-time-tracker-notification-scheduler` (`ENABLED=false`)
5. **Do not deploy** `send-test-web-push` unless explicitly approved with `WEB_PUSH_TEST_ENABLED=false` guard verified

See also: [production-deploy-plan.md](./production-deploy-plan.md)
