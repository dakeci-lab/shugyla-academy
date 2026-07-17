# Request Inventory (Cold Start & Key Routes)

**Commit:** `d765798`  
**Method:** Static inventory from code paths. Wall-clock Start/Duration/Size/Rows are **unknown** unless marked from local DB aggregates.  
**Rule:** No tokens, headers, or personal data.

Legend for columns:

- **Повтор** — same logical request purpose fires more than once in the scenario  
- **Блокирует UI** — contributes to global `DataLoadingScreen` / auth gates  

---

## A. Cold start → first authenticated `/platform` paint

| № | Маршрут | Инициатор | Запрос | Таблица/Function | Начало | Время | Размер | Строки | Повтор | Блокирует UI | Комментарий |
|---|---------|-----------|--------|-----------------|--------|-------|--------|--------|--------|--------------|-------------|
| 1 | `/platform` | `authService.resolveSupabaseAuthSession` | Auth getSession / INITIAL_SESSION | Supabase Auth | T0 | n/a | n/a | — | Нет* | Да | *TOKEN_REFRESHED may add wait |
| 2 | `/platform` | `loadAcademyProfileByAuthUserId` | SELECT safe fields | `academy_users` | after #1 | n/a | n/a | 1 | Нет | Да | Own profile |
| 3 | `/platform` | `loadAcademyAssignmentsForEmployee` | SELECT course_id | `academy_course_assignments` | after #2 | n/a | n/a | small | Нет | Да | Own assignments |
| 4 | `/platform` | `rbacSupabaseAdapter.loadRbacSnapshot` | SELECT * | `roles` | after #3 | n/a | n/a | catalog | Частично | Да | Also called inside session build |
| 5 | `/platform` | same | SELECT * | `permissions` | parallel w/ #4 | n/a | n/a | catalog | Нет | Да | |
| 6 | `/platform` | same | SELECT role_id, permission_id | `role_permissions` | parallel | n/a | n/a | catalog | Нет | Да | |
| 7 | `/platform` | `loadEmployeeCountsByRoleCode` | SELECT role, role_id | `academy_users` | parallel | n/a | n/a | all users | **Да** vs #8 | Да | Overlaps Wave A users |
| 8 | `/platform` | `fetchAllData` Wave A | SELECT safe fields ORDER BY id | `academy_users` | after Auth gate | n/a | n/a | all users | **Да** vs #2/#7 | Да | Full staff dump |
| 9 | `/platform` | Wave A | SELECT * | `academy_courses` | parallel | n/a | n/a | all | Нет | Да | |
| 10 | `/platform` | Wave A | SELECT * WHERE NOT deleted | `academy_lessons` | parallel | n/a | n/a | all | Нет | Да | |
| 11 | `/platform` | Wave A | SELECT * | `academy_course_assignments` | parallel | n/a | n/a | all | **Да** vs #3 | Да | Full assignments |
| 12 | `/platform` | Wave A | SELECT * | `academy_progress` | parallel | n/a | n/a | all | Нет | Да | Unbounded |
| 13 | `/platform` | Wave B | SELECT * ×3 | `academy_tests`, questions, attempts | after Wave A | n/a | n/a | all | Нет | Да | Soft-fail module |
| 14 | `/platform` | Wave B | multi SELECT * | learning path tables | after Wave A | n/a | n/a | all | Нет | Да | Soft-fail |
| 15 | `/platform` | Wave B | multi SELECT * | standards tables | after Wave A | n/a | n/a | all | Нет | Да | Soft-fail |
| 16 | `/platform` | Wave B | SELECT * ×3 | vacancies, questions, candidates | after Wave A | n/a | n/a | all | Нет | Да | Soft-fail |
| 17 | `/platform` | Wave B | SELECT * | `platform_suppliers` | after Wave A | n/a | n/a | all | Нет | Да | Soft-fail |
| 18 | `/platform` | Wave B | SELECT * | `purchase_orders` | after Wave A | n/a | n/a | all | Нет | **Да** | **Hard-fail** |
| 19 | `/platform` | Wave B | SELECT * | `purchase_order_items` | after #18 start | n/a | n/a | all | Нет | **Да** | **Hard-fail** |
| 20 | `/platform` | Wave B | SELECT * | `receiving_documents` | after Wave A | n/a | n/a | all | Нет | **Да** | **Hard-fail** |
| 21 | `/platform` | Wave B | SELECT * | `receiving_items` | with receiving | n/a | n/a | all | Нет | **Да** | **Hard-fail** |

Estimated total before UI: **~26–31** network calls (Auth + REST). Edge Functions typically **0** on pure cold bootstrap.

---

## B. After shell (background / layout)

| № | Маршрут | Инициатор | Запрос | Таблица/Function | Повтор | Блокирует UI | Комментарий |
|---|---------|-----------|--------|-----------------|--------|--------------|-------------|
| 22 | any `/platform` | `NotificationInboxProvider` | unread count | `notifications` | Idle | Нет | After auth |
| 23 | any `/platform` | `registerServiceWorker` / Session | push ensure | Edge `manage-push-subscription` | Rare | Нет | If VAPID configured |
| 24 | any `/platform` | `useProcurementRealtime` | Realtime channel | `purchase_orders`, `receiving_documents` | 1 channel | Нет | |
| 25 | any `/platform` | poll 15s | refreshProcurementData | purchases + receiving | **Каждые 15s** | Нет | Even with realtime |

---

## C. Direct routes (additional after or instead of list navigation)

| № | Маршрут | Инициатор | Запрос | Таблица/Function | Повтор | Блокирует UI | Комментарий |
|---|---------|-----------|--------|-----------------|--------|--------------|-------------|
| 26 | `/platform/employees/list` | `EmployeesSection` | Edge list | `admin-list-employees` | Per filter/page | Page skeleton | Paginated 50; **does not use cloudStore employees** |
| 27 | `/platform/employees/:id` | `EmployeeProfileSection` | Edge by id | `admin-list-employees` (`employee_id`) | Once | Profile header | Primary path after redeploy |
| 28 | `/platform/employees/:id` | `EmployeeScheduleSection` | Edge team month | `admin-team-workforce-data` | Per month | Schedule section | **Over-fetch team**, client filter |
| 29 | `/platform/employees/schedule` | `WorkScheduleSection` | Edge team week/month | `admin-team-workforce-data` | Per navigation | Page | |
| 30 | `/platform/employees/rating` | `EmployeeRatingSection` | Edge + settings | workforce + attendance settings | Per month | Page | |
| 31 | `/platform` home / time-tracker | tracker section | Edge action / shifts | `employee-time-tracker-action` | Interaction | Partial | |
| 32 | `/platform/procurement` | page + store | often from cloudStore | — | May refresh via realtime | Page | Already loaded in bootstrap |
| 33 | `/platform/academy/*` | page | often from cloudStore | — | May refetch via `getCourses`→`fetchAllData` | Risk | **Dangerous full refetch API** |

---

## D. Known duplicate / waterfall edges

| Pattern | Proof | Prod vs Dev |
|---------|-------|-------------|
| `academy_users` ×3 purposes on cold start | auth profile + RBAC counts + Wave A | Both |
| Assignments ×2 (own then all) | authService + Wave A | Both |
| Wave B waits for Wave A | sequential `await` then `allSettled` | Both |
| Team workforce for one employee | `fetchEmployeeWorkforceBundle` | Both |
| StrictMode double effects | React 18 DEV | **Dev-only** unless proven in prod Network |
| `getEmployees` → `fetchAllData` | `academyDataService.js` | Both if called |

---

## E. Measurement gaps

Fill Start/Duration/Size/Rows from Chrome Network (3 medians) in a follow-up measurement session:

1. Production cold start (admin)  
2. Warm reload  
3. SPA transitions  
4. Direct `/platform/employees/:id`  
5. Fast 4G + 390px PWA  

Do **not** commit HAR files with Authorization headers.
