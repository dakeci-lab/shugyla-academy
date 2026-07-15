# Auth-first Frontend Production Deploy Plan

**Status:** Prepared locally (Step 22M). **Not deployed.** Phase 2 **not applied**.

Related: [production-auth-cutover-plan.md](./production-auth-cutover-plan.md), [production-auth-rollout-checklist.md](./production-auth-rollout-checklist.md)

---

## 1. Preconditions (must all pass before deploy)

| Check | Expected |
|-------|----------|
| Production baseline | `academy_users=18`, `auth.users=18`, linked **18/18**, conflicts **0** |
| Authenticated Edge Function smoke test | Step 22L **passed** |
| Production admin functions | **3** ACTIVE, `verify_jwt=true` |
| Git working tree | **clean** at deploy commit |
| `npm run build` | exit **0** |
| `npm run verify:auth-first-frontend-production-readiness` | exit **0** |
| Owner approval | **separate explicit confirmation** for frontend deploy |

---

## 2. Deploy scope

**In scope:**

- GitHub Pages static build (`dist/`) from approved commit
- Auth-first login via Supabase `signInWithPassword` + `auth_user_id` profile lookup
- Employee admin UI via three deployed Edge Functions

**Out of scope (do not run on deploy step):**

- SQL migrations (Phase 1 already applied; Phase 2 **not** on this step)
- Edge Function deploy (already done in 22H)
- RLS / policy / grant changes
- Notification migrations, notification Edge Functions, Cron
- Secrets set/unset, Web Push enablement
- Auth user or `academy_users` mutations

---

## 3. Auth-first login flow (production)

1. User enters familiar **login** and **password** on `/login`.
2. Frontend maps login → technical email via `loginToTechnicalEmail()` (not shown in UI).
3. `supabase.auth.signInWithPassword({ email, password })` validates credentials.
4. Profile loaded: `academy_users.auth_user_id = auth.user.id` (safe fields only, **no password**).
5. Checks: profile exists, `status = active`, role exists, permissions loaded from RBAC tables.
6. Frontend session state created; `shugyla_user` stores safe profile snapshot only.
7. **No** legacy fallback: Auth failure does **not** query `academy_users.password`.

**Error UX (no PII leakage):**

| Condition | Message |
|-----------|---------|
| Wrong credentials | «Неверный логин или пароль» |
| Inactive account | «Аккаунт деактивирован. Обратитесь к администратору.» |
| Auth OK, no profile link | «Учётная запись не настроена. Обратитесь к администратору.» |
| Network failure | «Нет соединения. Повторите попытку.» |

---

## 4. Employee admin (cloud mode)

| Operation | Endpoint | Notes |
|-----------|----------|-------|
| List | `admin-list-employees` | Paginated; no password / raw `auth_user_id` |
| Create | `admin-create-employee` | `temporary_password` only; no direct Auth/DB insert from frontend |
| Update | `admin-update-employee` | Whitelist fields; no login/password/auth_user_id |

Frontend RBAC is UX-only; Edge Functions enforce `employees.view/create/edit`.

---

## 5. Direct database access audit (frontend)

Operations that remain until Phase 2 security cutover. Legacy anon grants still allow some reads in production today.

| File | Operation | Table | Phase 2 blocker |
|------|-----------|-------|-----------------|
| `authService.js` | SELECT safe profile | `academy_users` | Own-profile RLS after Phase 2 |
| `authService.js` | SELECT assignments | `academy_course_assignments` | Own-profile policy |
| `rbacSupabaseAdapter.js` | SELECT | `roles`, `permissions`, `role_permissions` | Catalog read policy (Phase 2) |
| `rbacSupabaseAdapter.js` | SELECT role usage | `academy_users` (role counts) | Admin RBAC UI |
| `supabaseDataAdapter.js` | SELECT safe fields | `academy_users` | **Blocker** — bulk employee fetch for non-admin paths |
| `supabaseDataAdapter.js` | INSERT/UPDATE/DELETE | `academy_users` | **Blocker** — legacy CRUD; cloud employee admin bypasses via Edge Functions |
| `supabaseDataAdapter.js` | SELECT `*` + password compare | `academy_users` | **Deprecated** — not used in Auth-first login |
| `shiftSupabaseAdapter.js` | SELECT/UPSERT | `academy_employee_shifts` | Phase 2 shift policies |
| `attendanceSupabaseAdapter.js` | SELECT | `academy_employee_shifts` | Phase 2 |

**Employee admin screen (Step 22M):** list/create/update/deactivate use Edge Functions in cloud mode — **ready for Auth-first deploy**.

**Not rewritten on 22M:** procurement, shifts, attendance, standards, recruitment direct adapters — document as Phase 2 follow-up.

---

## 6. GitHub Pages / PWA

| Item | Value |
|------|-------|
| Vite `base` | `/shugyla-academy/` |
| React Router basename | from `import.meta.env.BASE_URL` |
| PWA `start_url` / `scope` | `/shugyla-academy/` |
| Service worker base | `/shugyla-academy/` |
| SPA fallback | `404.html` copy of `index.html` |

Deep links and refresh rely on GitHub Pages SPA routing + `.nojekyll`.

---

## 7. Production smoke test (after deploy — separate owner approval)

Non-mutating checks only:

1. Admin login succeeds (Auth-first).
2. Active non-admin employee login succeeds.
3. Inactive employee blocked after profile check.
4. Page refresh restores session.
5. Logout clears session; protected route redirects to login.
6. Admin employee list loads via Edge Function (count only — do not log rows).
7. **No** employee create/update during smoke.

---

## 8. Observation window

- Legacy anon grants **temporarily preserved** (Phase 1 state).
- Monitor login error rates after deploy.
- **Do not** add employees via old legacy frontend path after deploy.
- New employees: Auth-first `admin-create-employee` flow only.

---

## 9. Rollback plan (document only — do not execute unless approved)

1. Redeploy previous frontend commit/build to GitHub Pages.
2. **Do not** delete Auth users or `auth_user_id` links.
3. **Do not** remove deployed Edge Functions.
4. **Do not** apply Phase 2 as rollback — Phase 2 is forward-only security cutover.
5. Legacy frontend can still authenticate against preserved anon grants until Phase 2.

Rollback trigger examples: widespread login failure, session restore failures, admin employee list broken.

---

## 10. Owner approvals (separate gates)

| Gate | Action |
|------|--------|
| **A** | Frontend production deploy (this plan) |
| **B** | Post-deploy production smoke test |
| **C** | Phase 2 security cutover (`20260714210000_production_auth_security_cutover_phase2.sql`) |
| **D** | Phase 3 legacy password cleanup |
| **E** | Notification rollout |

Step 22M completes preparation only — **Gate A not executed**.

---

## 11. Local verification (Step 22M)

```bash
npm run verify:auth-first-frontend-production-readiness
npm run supabase:local:verify-auth-first
npm run supabase:local:verify-employee-provisioning
npm run supabase:local:verify-employee-admin-access
npm run supabase:local:verify-production-auth-cutover
npm run build
```

All must exit **0** before owner approves deploy.

**Important:** Production GitHub Pages build must use production `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (CI secrets or `.env.production`). Do **not** build with `.env.local` — that embeds `127.0.0.1:54321` into `dist/`.

---

## 12. Production mutation status

**Step 22M:** **0** production mutations. No deploy performed.
