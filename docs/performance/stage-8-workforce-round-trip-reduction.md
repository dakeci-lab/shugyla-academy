# Stage 8 — Workforce PostgREST round-trip reduction

**Date:** 2026-07-18  
**Runtime commit:** `96f128f` (`perf(workforce): reduce postgrest round trips`)  
**Edge:** `admin-team-workforce-data` → `cxadzerxndlscwvdaymk` (~740 kB)  
**Out of scope:** indexes, RLS, migrations, RPC, frontend contract changes, `admin-list-employees`.

## 1. Executive summary

Stage 7 proved SQL execution is &lt;2 ms while each PostgREST round-trip costs ~250–300 ms. Stage 8 fused authorization and workforce queries so Home uses **2 DB calls** (was 4). Production Home Resource median **1485 ms** (was 1773 / published 1752); Edge total median **1128 ms** with warm clean samples ~580–664 ms. DB-call budget met; latency improvement ~15% → **partially successful** against the ≥20% / ≤1400 ms gate.

## 2. Stage 7 evidence

SQL execution tiny; indexes present; service_role bypasses RLS; bottleneck = sequential PostgREST RTT.

## 3. Previous PostgREST call graph (Home)

```text
getClaims
→ PostgREST #1 academy_users caller
→ PostgREST #2 permissions (+ role_permissions)
→ PostgREST #3 shifts (day)
→ PostgREST #4 academy_users .in(ids)
```

## 4. FK / relation inventory

| Path | Constraint / hint | Status |
|------|-------------------|--------|
| users → roles | `roles!academy_users_role_id_fkey` | proven |
| roles → role_permissions → permissions | `role_permissions(permissions!inner(code))` | proven |
| shifts → users | **ambiguous** (`employee_id` + `created_by`) → use `academy_users!academy_employee_shifts_employee_id_fkey` | proven |
| users → shifts | same ambiguity → `academy_employee_shifts!academy_employee_shifts_employee_id_fkey` | proven |
| Outer nest keeps empty shifts | `schedule_keep_empty` test: parents with `[]` | proven |

## 5. Authorization fusion

One select:

```text
academy_users
  select: id,status,role,role_id,auth_user_id,
          roles!academy_users_role_id_fkey(
            role_permissions(permissions!inner(code))
          )
  eq auth_user_id = JWT sub
  in roles.role_permissions.permissions.code = server view codes
  maybeSingle
```

Empty nested permissions → all required codes false → 403. No silent multi-query fallback on this path. `getClaims` + `getUser` fallback unchanged.

## 6. Home workforce fusion

```text
academy_employee_shifts
  select: lean shift cols + academy_users!<employee_fkey>!inner(lean employee cols)
  eq shift_date = day
  eq academy_users.status = active
  neq academy_users.role = admin
  order employee_id
```

No second `.in(ids)` query. Response still `{ employees, shifts }` lean.

## 7. Profile workload

```text
academy_users
  select: WORKFORCE_EMPLOYEE + nested shifts!employee_fkey (outer)
  eq id = scoped employee
  gte/lte nested shift_date
```

Employee retained with empty shifts array when none in range. DB calls = 2.

## 8. Schedule workload

Same employee→outer shifts nest for team (`status=active`, `role≠admin`). Parents without shifts kept (10 active non-admin). DB calls = 2.

## 9. Request-scoped authorization

Returned per invocation: `{ serviceClient, caller, authUserId, authMethod, permissions, dbCalls, timings }`. No module-level / TTL cache.

## 10. Security

401/403, own/team scope, inactive caller, server-fixed view→permission map, body cannot supply permissions. Role/permission changes apply next request.

## 11. DB-call counter

Request-local `DbCallCounter`; header `X-Workforce-DB-Calls` (CORS exposed). Counts only; no SQL/PII.

## 12. Server-Timing

`token`, `auth`, `authorization_db`, `authorization`, `workforce_db`, `transform`, `total`.

## 13. Response contracts

Unchanged top-level Home / Profile / Schedule JSON. Frontend Stage 3 coalesce still ×1 invoke.

## 14. Before / after DB calls

| View | Before | After |
|------|-------:|------:|
| Home | 4 | **2** |
| Profile | 4 (2 authz + 2 data parallel/seq) | **2** |
| Schedule | 3–4 | **2** |

## 15. Before / after Home timing

| Metric | Before (SPA n=7) | After (SPA n=7) |
|--------|-----------------:|----------------:|
| Resource median | 1773 | **1485** |
| Resource min/max | 1452 / 3017 | 952 / 1887 |
| Edge total median | 1189 | **1128** |
| authorization_db | ~560 (2 calls) | **282** (1 call) |
| workforce_db | ~543 (2 calls) | **277** (1 call) |
| DB calls | 4 | **2** |
| Payload encoded | ~1412 | **1412** |
| Metrics | 6/5/0/1 | 6/5/0/1 |

vs published Stage 7 Resource 1752 → **−15.2%**.

## 16. Profile / Schedule after

| | Profile n=5 | Schedule n=5 (valid week) |
|--|------------:|--------------------------:|
| Resource median | 2009 | ~2344* |
| Edge total median | 671 | ~592 |
| DB calls | 2 | 2 |
| employees | 1 | 10 |
| shifts | 19 | 58 |

\*Schedule Resource variance high; Edge total and row counts stable. Employees without shifts preserved (count 10).

## 17. Tests

`verify:workforce-edge-round-trip-reduction` + Stage 4–6 workforce verifies + bootstrap/home/employees/schedule/tracker/drawer/procurement + `npm run build`.

## 18. Rollback

Redeploy Edge from `cca3b65` (Stage 6) or revert `96f128f` and redeploy `admin-team-workforce-data` only.

## 19. Remaining bottleneck

Still **~270 ms per PostgREST RTT** × 2. Further gains need fewer than 2 DB round-trips (e.g. single SQL/RPC — out of Stage 8) or moving Edge closer to DB / reducing network variance.

## 20. Recommended Stage 9

Evaluate a **single SECURITY DEFINER SQL function / RPC** returning authz+home payload in one DB round-trip (requires migration — only after explicit approval), **or** optimize `admin-list-employees` / bundle lazy routes if product priority shifts off Home Edge.
