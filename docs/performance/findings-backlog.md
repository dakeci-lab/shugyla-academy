# Findings Backlog — Loading Performance

**Source audit:** `docs/performance/database-loading-audit.md`  
**Commit audited:** `d765798`  
**Stage 1 implementation:** progressive bootstrap + failure isolation (see audit § Implementation — Stage 1)

| ID | Приоритет | Проблема | Доказательство | Ожидаемый эффект | Риск | Этап | Статус |
|----|-----------|----------|----------------|------------------|------|------|--------|
| F-01 | P1 | `/platform` UI ждёт полный `initializeData` / все модули | `AcademyDataContext.jsx` → `DataLoadingScreen` пока `loading \|\| !ready` | Сильное сокращение time-to-interactive на Home/Employees | Medium — сломать consumers cloudStore | 1 / 4 | **Fixed (Stage 1)** — shell after Auth/RBAC; module states |
| F-02 | P1 | Wave B стартует только после Wave A | `supabaseDataAdapter.fetchAllData` | Меньше waterfall latency | Low–Medium | 1 | **Fixed (Stage 1)** — modules load via `ensureModuleLoaded`; procurement not tied to Wave A |
| F-03 | P1 | Unbounded `select('*')` (purchases, receiving, progress, tests, HR, …) | ~43 `select('*')` в `src/services/*` | Меньше payload/CPU parse | Medium — пропущенные поля | 1 | Open — deferred (column trim needs consumer audit) |
| F-04 | P1 | Ошибка закупов/приёмки валит весь bootstrap | throw в `fetchAllData` на rejected purchases/receiving | Home/Employees живут при сбое procurement | Medium — скрыть ошибку закупа, если не показать на route | 1 | **Fixed (Stage 1)** — soft-isolate + module `error` state on pages |
| F-05 | P2 | Тройная загрузка `academy_users` (profile / RBAC counts / Wave A) | `authService` + `rbacSupabaseAdapter` + Wave A | −1…2 REST на cold start | Low | 1 | Partial — core deferred from shell; Auth+RBAC overlaps remain |
| F-06 | P2 | `fetchEmployeeWorkforceBundle` тянет всю команду за месяц | `workforceAdminService.js` filter client-side | Быстрее карточка/график одного сотрудника | Medium — нужен Edge param + redeploy | 1* / Edge stage | Open |
| F-07 | P2 | Нет `React.lazy` — один JS chunk ~1.35 MB | `App.jsx` static imports; `npm run build` | Быстрее parse на слабых устройствах | Medium — regress lazy boundaries | 7 | Open |
| F-08 | P2 | Soft-fail `[]` маскирует RLS/403 на academy tables | `settleTableResult` | Лучшая диагностика; меньше «пустых» экранов | Low–Medium | 1 | Partial — module errors for procurement/receiving; Wave A soft-fail remains |
| F-09 | P3 | Realtime procurement + poll 15s на всём `/platform` | `procurementRealtimeService` + `PlatformLayout` | Меньше фонового трафика | Low | 6 | **Fixed (Stage 1)** — gated to procurement/receiving routes |
| F-10 | P2–P3 | RLS `EXISTS` / `current_employee_is_active` на procurement | migration `20260717210000_secure_procurement_rls.sql` | Снижение DB time **если** планы подтвердят cost | High if broken security | 3 | Open — out of Stage 1 scope |
| F-11 | P2 (local) | Local DB: open `USING (true)` policies на assignments/suppliers | local `pg_policies` | Паритет local/prod security | Low for prod if already fixed | env hygiene | Open |
| F-12 | P3 | `getEmployees` / `getCourses` / `getLessonsByCourse` вызывают полный `fetchAllData` | `academyDataService.js` | Избежать повторного полного dump | Low | 1 | **Fixed (Stage 1)** — store + `ensureModuleLoaded` |
| F-13 | P3 | Employees list игнорирует cloudStore и снова ходит в Edge | `EmployeesSection` + `listEmployeesForAdmin` | Ожидаемо для admin DTO; не объединять слепо с Wave A | Medium | 4 | Open (accepted for admin DTO) |
| F-14 | P4 | Нет session/SWR кэша для RBAC/справочников между reload | architecture | Faster warm reload | Medium stale RBAC | 5 | Open |
| F-15 | P4 | Нет production Network baseline в этом аудите | audit limitations | Измеримость эффекта Stage 1 | — | measure first | Open — needs production Network pass |

\*F-06 «быстрый» фронтовый workaround без Edge: не вызывать team bundle для identity если admin lookup уже успешен (schedule всё равно нужен Edge) — отдельный маленький PR.

---

## Stage 1 fix notes

| ID | Решение | Проверка | Остаточный риск |
|----|---------|----------|-----------------|
| F-01 | Shell ready after Auth; progressive modules | `verify:progressive-bootstrap`, `verify:app-bootstrap`, local build | Consumers that ignore module ready could still flash empty — guarded on key pages |
| F-02 / F-04 | Split fetch + soft module errors; procurement route-triggered | structural verify; manual production failure inject recommended | Background waves still share bandwidth with route loads |
| F-09 | Realtime enabled only on procurement/receiving paths | code assert in verify script | Leaving route cleans channel; remount creates new channel (expected) |
| F-12 | No full dump from getEmployees/getCourses/getLessons | verify script | Pull-to-refresh still uses full reload path |

---

## Recommended next fix (after Stage 1 production check)

Do **not** auto-start Stage 2+. After production Network verification of Stage 1, pick one of: F-03 column trim for bootstrap tables, F-05 identity dedupe, or F-06 Edge employee_id (separate PR).

**Do not combine:** RLS rewrites (F-10), new indexes, full lazy-loading (F-07) with the next incremental PR unless measured.

---

## Stage mapping

| Этап | IDs | DB migration? | Edge redeploy? |
|------|-----|---------------|----------------|
| 1 — Bootstrap / request hygiene | F-01, F-02, F-03 (column trim), F-04, F-05, F-08, F-12 | No | No |
| 1b — Workforce single-employee | F-06 | No | **Yes** if API changes |
| 2 — Indexes | (after plans) | Yes | No |
| 3 — RLS helpers | F-10 | Maybe | No |
| 4 — Bootstrap redesign | F-01, F-13 | No | No |
| 5 — Caching | F-14 | No | No |
| 6 — Realtime | F-09 | No | No |
| 7 — Bundle | F-07 | No | No |

---

## Verification criteria (for fix PRs)

For each fix PR:

1. `npm run build`  
2. Cold start Network: count requests before first meaningful paint (median of 3)  
3. Scenario: Home, Employees list, Employee profile, Procurement (must still work)  
4. Failure injection: break purchases REST → Home/Employees must remain usable if Stage 1 claims isolation  
5. No weakening of Auth/RLS  

---

## Explicit non-goals (until separate prompts)

- Documents / HR cases / payroll modules  
- Full DB optimization mega-PR  
- Disabling RLS  
- Service role on frontend  
- Indexes / SQL migrations / Edge redeploy as part of Stage 1  
