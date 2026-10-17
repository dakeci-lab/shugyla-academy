# Migration Preflight — Notifications & Auth

**Status:** local analysis only. No production connection. No `db push`.

## Scope

Migrations required for notification system, Auth-first login, employee provisioning, and time tracker dispatch.

> **Note:** `20260714062253_web_push_delivery_tracking.sql` is an earlier duplicate filename. Canonical file: `20260714150000_web_push_delivery_tracking.sql`. Confirm production history before apply; do not apply both.

| Order | Migration | Purpose | Dependencies | Destructive | Production risk | Rollback |
|-------|-----------|---------|--------------|-------------|-----------------|----------|
| 1 | `20260712163000_complete_flexible_rbac.sql` | Flexible RBAC (`permissions`, `role_permissions`, `schedule.edit`) | `add_rbac_system` / schema | DROP/recreate policies possible | Medium — RBAC changes affect access | Revert policies; avoid dropping roles in use |
| 2 | `20260713194500_notification_system_foundation.sql` | Notification tables, RLS, seed templates/rules (`is_enabled=false`), `academy_users.auth_user_id` backfill | RBAC, `academy_users` | No DROP of academy tables; advisory lock | Medium — new tables + RLS | Disable rules; tables can remain |
| 3 | `20260714120000_auth_first_login_foundation.sql` | Auth-first RLS: drop permissive `academy_users` anon policy, own-profile SELECT | notification foundation | **DROP POLICY** on `academy_users` | **High** — removes anon read/write on `academy_users` | Restore old policy only with owner approval |
| 4 | `20260714130000_employee_provisioning_service_grants.sql` | `GRANT SELECT` on RBAC tables to `service_role` | RBAC tables exist | Grants only | Low | `REVOKE` grants |
| 5 | `20260714140000_web_push_subscription_foundation.sql` | Push subscription columns, device ownership, indexes | notification foundation | `ALTER TABLE` additive | Low | Additive only |
| 6 | `20260714150000_web_push_delivery_tracking.sql` | Delivery status tracking, request_id uniqueness, triggers | subscriptions + deliveries | `ALTER`, trigger replace | Low | Additive only |
| 7 | `20260714160000_time_tracker_dispatch_grants.sql` | `GRANT SELECT ON academy_employee_shifts TO service_role` | `academy_employee_shifts` exists | Grant only | Low | `REVOKE SELECT` |

## `20260714160000_time_tracker_dispatch_grants.sql` — detail

**Why needed:** Edge Functions and dispatch core use `service_role` client to read `academy_employee_shifts`. PostgREST/RLS does not expose shift rows to `service_role` without explicit `GRANT SELECT`.

**Production schema check:** Confirm `public.academy_employee_shifts` exists with columns used by dispatch (`shift_date`, `planned_start_time`, `planned_end_time`, `actual_start_time`, `actual_end_time`, `status`, `employee_id`).

**Risk:** Low. Read-only grant. No data mutation.

## Migration content checks (all files)

Verified absent from migration SQL:

- Production project ref (`cxadzerxndlscwvdaymk`)
- Real emails/passwords
- VAPID keys
- Scheduler secrets
- `service_role` key values
- Test fixture users
- `notification_rules.is_enabled = true` bulk enable

## Idempotency

- `20260713194500` uses `IF NOT EXISTS`, advisory lock, idempotent seeds
- `20260714120000` uses `DROP POLICY IF EXISTS`
- Grant migrations are idempotent on re-run

## Destructive operations summary

| Migration | Destructive ops |
|-----------|-----------------|
| `20260714120000` | Drops `"Allow anon read write academy_users"` policy |
| Others | Additive ALTER/CREATE/GRANT only |

## Recommended apply order

Same as table order (1 → 7). Do not skip `20260714120000` if Auth-first login is required in production.
