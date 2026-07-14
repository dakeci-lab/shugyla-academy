# Auth-first login (local foundation)

## Problem (old flow)

Previously the cloud login path:

1. Read `public.academy_users` via the **anon** client before Supabase Auth.
2. Compared `academy_users.password` with the entered password in the browser.
3. Called `signInWithPassword` only after that comparison.
4. Allowed **LEGACY** sessions for staff when Supabase Auth failed.

This exposed plaintext passwords, required anon SELECT grants, and bypassed Supabase Auth for many users.

## New flow (Auth-first)

### Cloud mode (Supabase configured)

1. User enters login / phone + password.
2. `loginToTechnicalEmail(login)` → technical email.
3. `supabase.auth.signInWithPassword({ email, password })` — **only Supabase Auth validates the password**.
4. Load profile: `academy_users` where `auth_user_id = session.user.id`.
5. Check `canEmployeeLogin(status)`; otherwise `signOut` + safe error.
6. Load own `academy_course_assignments`, RBAC catalog, build session.
7. Save platform session to `localStorage` **without password**.
8. **No LEGACY fallback** on Auth errors or network failures.

### Offline mode (no Supabase env)

- Existing mock login via `employeeData.authenticateEmployee` remains.
- `SESSION_TYPE.LEGACY`, `supabaseAuthenticated = false`.
- Notification inbox hidden.

## Profile lookup

- **Login / restore:** `auth_user_id = auth.uid()` only.
- **Not used:** login, email, or localStorage id as trusted identity in cloud mode.

## Database security (local migration)

Migration: `supabase/migrations/20260714120000_auth_first_login_foundation.sql`

- Private schema `auth_private` + `employee_owned_by_current_auth(bigint)` (SECURITY DEFINER).
- Removed permissive `Allow anon read write academy_users` policy.
- `authenticated`: column-level SELECT on safe profile fields only (**not** `password`).
- Policy `academy_users_select_own_profile`: `auth_user_id = auth.uid()`.
- Policy `academy_course_assignments_select_own` via auth helper.
- RBAC tables: `authenticated` SELECT only (roles, permissions, role_permissions).

## Why password is not read

- Auth-first queries use an explicit field list (`ACADEMY_PROFILE_SAFE_FIELDS`).
- PostgreSQL column grants block `password` for `authenticated`.
- Login never calls `authenticateUser()` / `row.password` compare in cloud mode.

## Session restore

1. Resolve Supabase JWT from storage.
2. No JWT → clear stale `shugyla_user`, unauthenticated.
3. JWT → load profile by `auth_user_id`.
4. Missing / inactive profile → `signOut`, clear storage.

## Deactivation

- Inactive / terminated status → login rejected after Auth, session cleared.
- `onAuthStateChange` re-validates profile; deactivated users are signed out.

## Assignments

- Loaded **after** Auth, only for the authenticated employee (`user_id` + RLS helper).

## Local verification

```bash
npm run supabase:local:bootstrap -- --reset
node scripts/local-auth-first-fixture.mjs --setup   # optional manual QA
npm run supabase:local:verify-auth-first
npm run supabase:local:verify-notifications
node scripts/local-auth-first-fixture.mjs --cleanup
```

Fixture users store a **mismatched** `academy_users.password` to prove Auth-first login ignores it.

## Notification inbox

Requires `supabaseAuthenticated === true` (Supabase Auth session). See [in-app notification center](../notifications/in-app-notification-center.md).

## Not implemented yet

- Auth user creation from Employee UI — **implemented locally via Edge Function** ([employee provisioning](./employee-auth-provisioning.md))
- Admin-wide `academy_users` SELECT policy
- Password column cleanup
- Login / technical email sync on employee edit
- Production migration / deploy
