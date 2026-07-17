# Database & Platform Loading Audit

**Date:** 2026-07-17  
**Branch:** `main`  
**Commit:** `d765798` (`refactor(employees): unify employee editing and direct lookup`)  
**Linked Supabase project ref (from local CLI link):** `cxadzerxndlscwvdaymk`  
**Audit type:** diagnostics only — no code/schema/deploy changes applied as fixes  

---

## 1. Executive summary

Cold start of the authenticated platform is dominated by a **global cloud bootstrap** (`initializeData` → `fetchAllData`) that:

1. Waits for Auth + profile + RBAC.
2. Loads **nearly all domain modules** (academy, tests, paths, standards, HR/recruitment, suppliers, purchases, receiving) before any `/platform` page can render.
3. Uses a **two-wave waterfall**: Wave A (`Promise.all` of 5 academy tables) must finish before Wave B (`Promise.allSettled` of 7 module loaders).
4. **Hard-fails** the entire bootstrap if purchases or receiving fail; soft-fails most other tables to empty arrays.
5. Ships a **single ~1.35 MB JS chunk** with **no route-level code splitting**.

The earlier Auth-before-ready bug in `AcademyDataProvider` appears **fixed** (provider waits for `AUTHENTICATED` + `supabaseAuthenticated`). Remaining performance risk is architectural: **UI waits for a full multi-module dump**, not a single slow Postgres query.

**RLS “slowness after enable”** is **partially supported as a hypothesis** (procurement RLS helper does `EXISTS` on `academy_users` per policy evaluation), but **not proven as the primary cold-start delay** without production query timings. Local DB is too small for meaningful plans.

---

## 2. Current architecture (facts from code)

### 2.1 Provider tree

```
main.jsx
  StrictMode → App
    LanguageProvider
      SessionProvider
        BrowserRouter
          AcademyDataProvider          ← blocks non-public UI until initializeData
            PermissionProvider         ← no network
              ToastProvider
                NotificationInboxProvider  ← deferred unread count
                  Routes → ProtectedRoute → PlatformLayout
```

Sources: `src/main.jsx`, `src/App.jsx`, `src/context/*`.

### 2.2 Actual bootstrap sequence

```
PWA shell recovery + SW register (on window load)
→ SessionProvider: INITIAL_SESSION → getSession → profile (academy_users)
→ assignments for employee → ensureRbacLoaded (roles/permissions/role_permissions + employee role counts)
→ AUTHENTICATED + rbacReady
→ AcademyDataProvider: initializeData → fetchAllData
     Wave A parallel: users, courses, lessons, assignments, progress
     Wave B after A: tests, learning paths, standards, recruitment, suppliers, purchases, receiving
→ setCloudStore → ready=true → platform shell + page
→ background: notifications unread, web push ensure, procurement realtime + 15s poll
```

### 2.3 What blocks UI

| Gate | Blocks? | Source |
|------|---------|--------|
| `authStatus === LOADING` | Yes | `AcademyDataContext`, `ProtectedRoute`, `PlatformSessionGate` |
| Full `initializeData` on non-public routes | **Yes** — `DataLoadingScreen` | `AcademyDataContext.jsx` |
| `!rbacReady` | Yes (guards) | `ProtectedRoute` / `PlatformRoute` |
| Notification unread | No | idle deferred |
| Procurement realtime / poll | No (after shell) | `PlatformLayout` |
| Page-level Edge (employees list, workforce) | After shell | page components |

### 2.4 Auth-before-ready regression check

| Check | Result |
|-------|--------|
| `AcademyDataProvider` fetches before Auth ready | **Not found** — waits for `AUTHENTICATED` && `supabaseAuthenticated` |
| Soft-fail masks empty tables | **Yes** — `settleTableResult` returns `[]` on REST errors for Wave A tables |
| Purchases/receiving fail whole boot | **Yes** — throw from `fetchAllData` |
| `TOKEN_REFRESHED` re-runs full bootstrap | **No** — only sets `supabaseAuthenticated` |
| Full reload re-fetches everything | **Yes** — no persisted cloud cache |

---

## 3. Waterfall (structural — not production wall-clock)

> Live browser Network medians for production were **not collected** in this audit (no authenticated production DevTools session from the audit environment). Times below are **structural phases**, not measured ms.

```
Auth restore + profile + RBAC     [sequential]
  └─ getSession / INITIAL_SESSION
  └─ academy_users (own profile)
  └─ academy_course_assignments (own)
  └─ RBAC Promise.all (roles, permissions, role_permissions, academy_users role counts)

fetchAllData Wave A               [parallel, blocks Wave B]
  └─ academy_users (ALL — again)
  └─ academy_courses *
  └─ academy_lessons *
  └─ academy_course_assignments *
  └─ academy_progress *

fetchAllData Wave B               [parallel modules, after Wave A]
  └─ tests (3 tables *)
  └─ learning paths (multi *)
  └─ standards (multi *)
  └─ recruitment (3 tables *)
  └─ suppliers *
  └─ purchase_orders * + purchase_order_items *   ← hard-fail
  └─ receiving_documents * + receiving_items *    ← hard-fail

Interface visible                 [only after Wave A+B success]
Page-level Edge (optional)        [employees/schedule/rating]
Realtime + 15s procurement poll   [after PlatformLayout]
```

**Theoretical parallelization (not implemented):** after Auth, load only shell-critical data (profile already loaded; RBAC done); defer academy/HR/procurement dumps to route entry. Do **not** blindly wrap all modules in one giant `Promise.all` without failure isolation.

---

## 4. Baseline metrics

### 4.1 Measured in this audit

| Metric | Value | Method |
|--------|-------|--------|
| Production JS bundle (single chunk) | **1347.16 kB** (~340 kB gzip) | `npm run build` |
| Production CSS | **220.84 kB** (~34 kB gzip) | `npm run build` |
| Route-level `React.lazy` | **None** in `App.jsx` | code search |
| Local `academy_users` rows | **4** | local Postgres `pg_stat_user_tables` |
| Local `academy_employee_shifts` rows | **3** | local |
| Local purchases/receiving rows | **0** | local |
| Index on `academy_users.auth_user_id` | **Yes** (unique partial) | local `pg_indexes` |
| `pg_stat_statements` extension | **Present locally** | local |
| Production cold-start wall times | **Not measured** | no prod DevTools session |
| Production row counts / Advisors | **Not measured** | no production SQL Editor access in audit |

### 4.2 Estimated request count (cold start, admin, from code)

Conservative **minimum REST/Auth calls before first paint of platform content**:

| Phase | Approx. requests |
|-------|------------------|
| Auth session | 1–2 |
| Profile + own assignments | 2 |
| RBAC snapshot | 4 (roles, permissions, role_permissions, users role counts) |
| Wave A | 5 |
| Wave B modules | ~14–18 table reads (tests 3, paths ~3, standards ~3, recruitment 3, suppliers 1, purchases 2, receiving 2) |
| **Total before UI** | **~26–31** |

Then after UI:

| Phase | Approx. |
|-------|---------|
| Notifications unread | 1 |
| Web push (if enabled) | 0–1 Edge |
| Platform home / time tracker | Edge / REST as needed |
| Employees list | Edge `admin-list-employees` |
| Employee profile schedule | Edge `admin-team-workforce-data` (full team month) |
| Procurement realtime | 1 channel + poll every 15s |

**Duplicate identity loads on cold start alone:** `academy_users` is read for (1) own profile, (2) RBAC role counts, (3) full employee list in Wave A — **three overlapping purposes**.

---

## 5. Hypothesis evaluation

| # | Hypothesis | Status | Evidence |
|---|------------|--------|----------|
| H1 | RLS made queries slower | **Partial** | Procurement RLS uses `SECURITY DEFINER` + `EXISTS` on `academy_users` (`20260717210000_secure_procurement_rls.sql`). No production `EXPLAIN ANALYZE` to quantify. Local tables empty / migration incomplete for procurement helper. |
| H2 | Heavy EXISTS/JOIN in RLS | **Partial** | Confirmed pattern in procurement + `employee_owned_by_current_auth`. `academy_users` own-profile policy is simple equality. |
| H3 | Too many separate requests | **Confirmed (high)** | ~26–31 REST before UI; Wave B alone fans out many full-table reads. |
| H4 | Sequential awaits | **Confirmed (high)** | Auth chain sequential; Wave B waits for Wave A; Session restore then RBAC. |
| H5 | Duplicate requests | **Confirmed (high)** | Triple `academy_users` purpose; `getEmployees`/`getCourses` can re-call `fetchAllData`; workforce bundle over-fetches team for one employee. |
| H6 | React effects cause repeats | **Partial** | StrictMode may double effects in DEV; `pendingInitialize` dedupes. Production remount loops not proven without Network. |
| H7 | No cache for rare data | **Confirmed (high)** | In-memory `cloudStore` only; full dump every reload; RBAC cache in-memory only. |
| H8 | Missing indexes | **Partial / low for cold start** | `auth_user_id` indexed; shifts have employee+date indexes. Local EXPLAIN used Seq Scan due to tiny tables. Production index gaps for RLS helpers **unproven**. |
| H9 | Too many rows/columns | **Confirmed (architecture)** | Widespread `select('*')`, unbounded purchases/receiving/progress/tests/candidates. Severity scales with production data volume (not measured here). |
| H10 | Heavy JOINs | **Not confirmed as primary** | Most reads are flat table dumps; purchases join items in app (2 queries). |
| H11 | Full bootstrap after Auth | **Confirmed (high)** | By design in `AcademyDataProvider`. |
| H12 | Realtime excess | **Partial** | One procurement channel + **15s poll always**; can refresh procurement after mount. |
| H13 | UI waits for all modules | **Confirmed (high)** | `DataLoadingScreen` until `initializeData` completes. |
| H14 | Optional module error blocks boot | **Confirmed for purchases/receiving; soft for others** | Hard throw vs `settleTableResult` / empty defaults. |
| H15 | Not only Postgres | **Confirmed (high)** | Large single JS bundle; Auth sequential; Edge later on admin routes; global loading gate. |

---

## 6. Top 10 causes of slow loading (ranked by confidence × impact)

| Rank | Cause | Category | Confidence | Severity |
|------|-------|----------|------------|----------|
| 1 | Global bootstrap waits for all modules before UI | Architecture | High | P1 |
| 2 | Wave A → Wave B waterfall + many unbounded `select('*')` | Network / payload | High | P1 |
| 3 | Hard dependency on purchases + receiving for any platform page | Failure coupling | High | P1 |
| 4 | Duplicate / overlapping `academy_users` loads | Duplicate work | High | P2 |
| 5 | Monolithic JS bundle (~1.35 MB), no lazy routes | Frontend | High | P2 |
| 6 | `fetchEmployeeWorkforceBundle` loads full team month for one employee | Edge over-fetch | High | P2 |
| 7 | Soft-fail empty arrays hide RLS/permission failures | Reliability | High | P2 |
| 8 | Procurement realtime + 15s polling after every shell mount | Realtime | Medium | P3 |
| 9 | Possible RLS EXISTS cost on large procurement tables | RLS | Medium | P2–P3* |
| 10 | `getEmployees`/`getCourses` re-trigger full `fetchAllData` | API design | Medium | P3 |

\*P2 only if production Advisors/`pg_stat_statements` show high cost — **not verified in this audit**.

---

## 7. Findings (structured)

### F-01 — Global UI gate on full cloud dump

- **Category:** Bootstrap architecture  
- **Severity:** P1 | **Confidence:** High  
- **Routes:** All `/platform/*` (non-public)  
- **Files:** `src/context/AcademyDataContext.jsx`, `src/services/academyDataService.js`, `src/services/supabaseDataAdapter.js`  
- **Behavior:** `(loading || !ready) && !isPublicRoute` → `DataLoadingScreen` until entire `initializeData` finishes.  
- **Why slow:** Home, employees, academy, etc. wait for suppliers/HR/tests/purchases even when unused.  
- **Fix (future):** App shell + critical path + page-level loads; isolate module failures.  
- **Migration / Edge redeploy:** No  

### F-02 — Two-wave sequential bootstrap

- **Category:** Waterfall  
- **Severity:** P1 | **Confidence:** High  
- **Files:** `supabaseDataAdapter.js` (`fetchAllData`)  
- **Behavior:** Wave B starts only after Wave A settles.  
- **Fix (future):** Overlap non-dependent modules carefully; or drop global dump.  

### F-03 — Unbounded `select('*')` dumps

- **Category:** Payload  
- **Severity:** P1 (grows with data) | **Confidence:** High (pattern), Medium (prod impact)  
- **Files:** `purchaseSupabaseAdapter.js`, `receivingSupabaseAdapter.js`, `testSupabaseAdapter.js`, `recruitmentSupabaseAdapter.js`, `standardsSupabaseAdapter.js`, `learningPathSupabaseAdapter.js`, `supabaseDataAdapter.js`, etc. (~43 `select('*')` sites under `src/services`)  
- **Fix (future):** Column lists, date filters, pagination, route-scoped loads.  

### F-04 — Purchases/receiving hard-fail entire app boot

- **Category:** Failure isolation  
- **Severity:** P1 | **Confidence:** High  
- **Files:** `supabaseDataAdapter.js` lines ~255–275  
- **Behavior:** Rejected purchases/receiving → throw → load error / blocked platform.  
- **Fix (future):** Soft-fail or defer procurement to procurement routes (with clear error UI there).  

### F-05 — Duplicate academy_users access on cold start

- **Category:** Duplicate requests  
- **Severity:** P2 | **Confidence:** High  
- **Services:** `authService` profile, `rbacSupabaseAdapter.loadEmployeeCountsByRoleCode`, Wave A `academy_users`  
- **Fix (future):** Reuse profile; compute role counts from already-loaded employees or server aggregate.  

### F-06 — Workforce over-fetch for one employee

- **Category:** Edge Function usage  
- **Severity:** P2 | **Confidence:** High  
- **Files:** `workforceAdminService.fetchEmployeeWorkforceBundle`  
- **Behavior:** Calls `admin-team-workforce-data` for whole team month, filters client-side.  
- **Fix (future):** Edge support for single `employee_id` (separate stage; needs Edge change + redeploy).  

### F-07 — No route code splitting

- **Category:** Frontend bundle  
- **Severity:** P2 | **Confidence:** High  
- **Evidence:** `App.jsx` static imports all platform pages; build emits one JS chunk ~1.35 MB.  
- **Fix (future):** `React.lazy` per major route group.  

### F-08 — Soft-fail empty data

- **Category:** Error handling  
- **Severity:** P2 | **Confidence:** High  
- **Files:** `settleTableResult` in `supabaseDataAdapter.js`  
- **Risk:** Looks “fast but empty”; masks 401/403/RLS issues similar to historical procurement bug.  

### F-09 — Procurement poll every 15s

- **Category:** Realtime  
- **Severity:** P3 | **Confidence:** High  
- **Files:** `procurementRealtimeService.js`, `PlatformLayout`  
- **Fix (future):** Poll only when realtime unavailable; subscribe only on procurement routes.  

### F-10 — RLS helper EXISTS (procurement)

- **Category:** RLS  
- **Severity:** P2–P3 | **Confidence:** Medium  
- **Evidence:** `auth_private.current_employee_is_active()` in migration `20260717210000_secure_procurement_rls.sql`; STABLE SECURITY DEFINER; looks up `academy_users` by `auth_user_id`.  
- **Local gap:** Function **not present** on local DB used for this audit; production assumed applied.  
- **Index support:** Unique index on `academy_users(auth_user_id)` exists locally — good for helper.  
- **Fix (future):** Measure with `EXPLAIN ANALYZE` on production-sized data; consider `(select auth_private.current_employee_is_active())` once-per-query patterns if plans show per-row re-eval (verify before changing).  

### F-11 — Local open policies still present (environment drift)

- **Category:** Security / env parity  
- **Severity:** P2 security (local) | **Confidence:** High for local only  
- **Evidence:** Local `pg_policies` still shows `Allow anon read write academy_course_assignments` (`USING true`) and `Allow anon read write platform_suppliers`.  
- **Note:** Production may differ; treat as **local drift warning**, not production proof.  

---

## 8. RLS audit (summary)

| Table (code/migrations) | RLS intent | Helper | Notes |
|-------------------------|------------|--------|-------|
| `academy_users` | Own profile SELECT | `auth.uid() = auth_user_id` | Simple; indexed |
| `academy_course_assignments` | Own rows | `employee_owned_by_current_auth(user_id)` | STABLE SECURITY DEFINER + EXISTS |
| `academy_employee_shifts` | Own rows | same helper on `employee_id` | Indexed employee+date |
| `purchase_*` / `receiving_*` | Active employee | `current_employee_is_active()` | Migration 20260717; EXISTS to academy_users |
| `notifications` | Own | `auth_user_id = auth.uid()` | Indexed |
| `roles` / `permissions` | Broad SELECT | `true` for authenticated (local) | Small catalogs |

**Functions used in RLS (local):**

| Function | Volatility | SECURITY DEFINER |
|----------|------------|------------------|
| `auth_private.employee_owned_by_current_auth` | STABLE | Yes |
| `auth_private.current_employee_is_active` | STABLE (in migration) | Yes — **missing on local DB** |

**Query plan (local, tiny data):**

```
EXPLAIN SELECT id FROM academy_users
WHERE auth_user_id = '…' AND status = 'active';
→ Seq Scan (4 rows) — planner ignores index due to size, not proof of missing index
```

Production Advisors / `pg_stat_statements` top queries: **not retrieved**.

---

## 9. Index audit (summary)

**Present (local, relevant):**

- `idx_academy_users_auth_user_id_unique` (partial unique)
- `idx_academy_users_role_id`
- `idx_employee_shifts_employee_date`, `idx_employee_shifts_date`
- Purchase/receiving FKs and status indexes (from migrations)
- Notification indexes (rich)

**Candidates for future measurement (do not create yet):**

| Candidate | Why | Risk |
|-----------|-----|------|
| Composite supporting RLS helper `(auth_user_id) INCLUDE (status)` | If plans show filter on status after auth_user_id lookup | Low–medium; validate with ANALYZE |
| Partial indexes on large archive tables by date | If unbounded date dumps confirmed | Medium |
| Avoid “index everything” | Small catalogs don’t need more | — |

No index recommendation is P1 without production plans.

---

## 10. Edge Functions (load-related)

| Function | When | Cold-start? | Notes |
|----------|------|-------------|-------|
| `admin-list-employees` | Employees list / profile | No | Direct `employee_id` supported after redeploy |
| `admin-team-workforce-data` | Schedule, rating, profile schedule | No | Over-used for single employee |
| `admin-update-employee` / `admin-create-employee` | Mutations | No | |
| `admin-manage-employee-schedule` | Schedule writes | No | |
| `employee-time-tracker-action` | Home / tracker | Page | |
| `manage-push-subscription` | Background | After auth | |

Bootstrap itself is **REST-heavy**, not Edge-heavy.

---

## 11. Realtime

| Subscription | Filter | Lifecycle |
|--------------|--------|-----------|
| `procurement-sync-*` on `purchase_orders` + `receiving_documents` | none beyond table | Mounted with `PlatformLayout` when `user` set; cleaned on unmount |
| Polling fallback | 15s | Always with subscription |

No evidence of subscription-per-render loop in code review; poll may still cause periodic `refreshProcurementData`.

---

## 12. Caching

| Data | Loaded | Cache | Stale risk if cached |
|------|--------|-------|----------------------|
| Profile | Every cold start | Session user in memory | Medium |
| RBAC | Cold start (+ cache in rbacService) | Memory | Medium (role changes) |
| Full cloud dump | Every cold start / pull-to-refresh | `cloudStore` memory | High if long-lived without invalidation |
| Employees list (admin Edge) | Per page visit | None | — |
| Schedule month | Per navigation/month | None | — |
| Notifications | Idle + inbox | None beyond UI state | — |

---

## 13. Volumes (local only)

Local DB is a **sparse fixture** (not production scale). Largest live tables seen: `academy_users` (4), `academy_employee_shifts` (3). Most academy/procurement tables **0 rows**. Therefore local timings **cannot** validate production payload delay.

---

## 14. PWA & bundle

| Item | Finding |
|------|---------|
| Service worker | Registered on `load`; push ensure deferred |
| API caching | Not analyzed as caching authenticated REST (no evidence of unsafe API SW cache in quick review) |
| Bundle | Single chunk; no lazy routes |
| Long tasks | Not measured in Performance panel |

---

## 15. Prioritized optimization plan (do not execute now)

### Stage 1 — Fast frontend/bootstrap wins (no DB migrations)

1. Stop blocking `/platform` UI on non-critical modules (academy tests, HR, suppliers, full purchases dump).  
2. Soft-isolate procurement failures from home/employees.  
3. Remove/`store`-read for `getEmployees`/`getCourses` full refetch.  
4. Deduplicate `academy_users` role-count vs Wave A.  
5. Confirm production Network (3× medians) before/after.

**Expected effect:** Largest UX win (time-to-interactive).  
**Risk:** Medium (must not regress empty-store consumers).  
**DB migration:** No | **Edge redeploy:** No  

### Stage 2 — Indexes (only with plans)

Per-index migration + `EXPLAIN ANALYZE` before/after.  

### Stage 3 — RLS helpers

Simplify/measure EXISTS helpers; keep security; never disable RLS.  

### Stage 4 — Bootstrap redesign

App shell → critical → page-level → background; `allSettled` with per-module errors.  

### Stage 5 — Caching

RBAC/profile/reference data with explicit invalidation.  

### Stage 6 — Realtime

Route-scoped channels; poll only as fallback.  

### Stage 7 — Bundle/PWA

Lazy routes if Stage 1 shows remaining frontend cost.

**Do not combine** Stage 1 + Stage 3 + Stage 4 in one PR.

---

## 16. Risks of wrong “fixes”

- Disabling RLS or using service role on frontend — **forbidden**.  
- One mega JOIN/bootstrap RPC — high coupling & RLS complexity.  
- Eternal cache — stale permissions/purchases.  
- Index spam — write amplification without proof.  

---

## 17. Audit limitations

| Item | Status |
|------|--------|
| Production DevTools Network / Performance (3× medians) | **Not run** |
| Production SQL Editor / Advisors / Query Performance | **Not accessed** |
| `EXPLAIN ANALYZE` on production | **Not run** |
| Second RBAC role timings | **Not run** |
| Mobile PWA / Fast 4G | **Not instrumented** |
| Local DB parity with production RLS | **Incomplete** (missing `current_employee_is_active`) |
| HAR files | **Not stored** (policy) |

---

## 18. Tools used

- Static code analysis (read-only)  
- Local Supabase Postgres via Docker (`pg_stat_user_tables`, `pg_policies`, `pg_indexes`, `EXPLAIN`)  
- `npm run build`  
- Prior architecture exploration of auth/bootstrap/services  

## 19. Build result

`npm run build` — **success** (single JS + CSS chunks as above).

## 20. Created reports

- `docs/performance/database-loading-audit.md` (this file)  
- `docs/performance/request-inventory.md`  
- `docs/performance/findings-backlog.md`  

## 21. Git hygiene

No runtime diagnostic instrumentation left in application code. Working tree should only gain these docs (+ pre-existing untracked `tmp/`). **No commit/push/deploy performed.**

---

## Implementation — Stage 1: Progressive bootstrap and failure isolation

**Status:** implemented in application code (see commit message `perf(bootstrap): unblock app shell and isolate module loading`).  
**Audit baseline commit:** `d765798`.

### What changed

1. **Shell unblocked after Auth + RBAC** — `AcademyDataProvider` no longer waits for full `initializeData` / cloud dump before rendering children. Global `DataLoadingScreen` only covers `AUTH_STATUS.LOADING`. `PlatformSessionGate` still blocks protected layout until Auth/profile/RBAC are ready.
2. **Per-module load states** in `cloudStore` (`idle | loading | ready | error`) via `getModuleLoadState` / `isModuleReady` / `ensureModuleLoaded`.
3. **Progressive bootstrap** in `academyDataService.initializeData({ mode: 'progressive' })`:
   - route-critical modules prioritized from pathname;
   - background prefetch for standards / recruitment / suppliers + core academy cache;
   - **procurement / receiving are route-triggered** (not loaded on every `/platform` open).
4. **Failure isolation** — purchases/receiving no longer hard-fail `fetchAllData` / shell bootstrap; errors stay in module state and surface on procurement/receiving pages.
5. **Loading ≠ empty** — procurement, receiving, academy catalog/assignment, courses admin, dashboard use module readiness before showing empty copy.
6. **Realtime/polling** — `useProcurementRealtime` only on `/platform/procurement` and `/platform/receiving`.
7. **Duplicate hygiene (bootstrap-related)** — `getEmployees` / `getCourses` / `getLessonsByCourse` read store via `ensureModuleLoaded` instead of full `fetchAllData`; purchase/receiving mutations call `refreshProcurementData` instead of full `refreshData`.
8. **Logout** clears cloud bootstrap state so the next user cannot inherit the previous store.

### Shell-critical

- Supabase session restore  
- Current user profile  
- Role + RBAC (`rbacReady`)  
- Platform session gate / start route  

### Route-critical (examples)

| Route | Modules |
|-------|---------|
| `/platform` | `employees`, `courses`, `suppliers` |
| `/platform/academy/*` | `employees`, `courses`, `academyLearning` |
| `/platform/procurement`, `/platform/receiving` | `suppliers`, `procurement`, `receiving` |
| `/platform/standards` | `standards` |
| Employees list/profile/schedule | Edge/workforce (unchanged; not blocked by cloud dump) |

### Background

- `standards`, `recruitment`, `suppliers` (after shell; small waves)  
- Core academy cache (`employees`/`courses`/`academyLearning`) if not already route-loaded  
- **Not** auto-fetched at shell: full purchases/receiving dumps  

### Hard-fails removed

- Rejected purchases/receiving no longer throw out of `fetchAllData` or block shell.  
- Progressive bootstrap catch does not keep the whole platform on `DataLoadingScreen`.

### Duplicate requests reduced

| Call site | Before | After | Why safe |
|-----------|--------|-------|----------|
| `getEmployees` / `getCourses` / `getLessonsByCourse` | full `fetchAllData` each call | `ensureModuleLoaded` + store read | Same data already cached in module |
| Purchase/receiving mutations | `refreshData()` → full dump | `refreshProcurementData()` | Only those tables changed |
| Cold start procurement | always in Wave B | only when route opens / ensure | UI does not need purchases for Home/Employees |
| Procurement Realtime | every `/platform` layout | procurement/receiving routes only | Same channel semantics, scoped |

`academy_users` still may load for Auth profile + RBAC counts + core module (F-05 residual). Assignments own-vs-all still exist in Auth vs core (not merged without contract check).

### Remaining limits

- Unbounded `select('*')` on many tables still present (F-03 deferred).  
- Soft-fail `[]` on Wave A academy tables still masks some RLS errors (F-08 partial).  
- No persistent cache / SWR (F-14).  
- Bundle still monolith (~1.35 MB).  
- Production Network medians not measured in this environment.

### Measurements (structural / local)

| Metric | Before (audit @ `d765798`) | After (Stage 1) |
|--------|----------------------------|-----------------|
| Requests blocking shell | Auth + full Wave A+B (~26–31 REST) | Auth + RBAC only (shell) |
| Requests before layout | Full dump | Auth/profile/RBAC chain |
| Requests after layout | n/a (UI blocked) | Route-critical + background waves |
| `initializeData` on route change | full await each Auth effect | progressive kick once per user; route only `ensureModules` |
| Procurement at Home open | yes (Wave B hard) | no (route-triggered) |
| Local `npm run build` | success | success |

Wall-clock production TTI was **not** re-measured here (no authenticated production Network session in this pass).

### Needs production verification

- Cold PWA open on iPhone with saved session: shell before background finish.  
- Open Employees before academy core ready.  
- Open Procurement: loading copy, then real list (not false empty).  
- Inject purchases REST failure: Home/Employees remain usable.  
- Confirm Realtime only while on procurement/receiving.  
- Logout → login as another user: no leaked purchases/employees.