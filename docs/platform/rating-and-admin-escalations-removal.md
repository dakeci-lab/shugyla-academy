# Полное удаление «Рейтинга» и админского слоя эскалаций тайм-трекера

## 0. Статус: реализовано и полностью применено — код запушен в `main`, 3 Edge Functions передеплоены, миграция БД применена и подтверждена постчеком (2026-09-01)

## 1. Контекст

Мотивация сертификатами за топ-3 места в рейтинге признана неэффективной —
отметка прихода/ухода это прямая обязанность сотрудника (уже оплачивается
зарплатой), а не повод для отдельного поощрения. Владелец решил убрать
раздел «Рейтинг» целиком, а также смежный слой «Управление тайм-трекером»:
штрафные баллы, журнал опозданий, эскалации админам.

Аудит (два параллельных исследования кода) до начала работы установил
границу между тремя независимыми системами:

1. **Базовая отметка прихода/ухода** — `employee-time-tracker-action`,
   RPC `attendance_check_in`/`attendance_check_out`, `TimeTrackerSection.jsx`.
   **Не трогается** — на этих данных построен расчёт зарплаты по сменам.
2. **Сам рейтинг** — формула `100 + Σ баллов`, полностью в памяти, ничего
   не хранит в БД (таблица под события уже была удалена в июле).
   **Убирается целиком.**
3. **Журнал опозданий + эскалации админам** — отдельная система
   (`time_tracker_violations`, `time_tracker_escalation_settings`),
   независимая от рейтинга, с собственным дисклеймером в коде «Штрафы и
   дисциплинарные меры здесь не применяются». **Убирается целиком**, но
   **личные напоминания сотруднику** («скоро смена», «вы не отметились») —
   тот же крон-рассыльщик, другой набор правил — **оставлены** (владелец
   подтвердил явно).

## 2. Что удалено — фронтенд

- Страница/компоненты рейтинга целиком: `PlatformEmployeeRating.jsx`,
  `EmployeeRatingSection.jsx`, `EmployeeRatingDetailModal.jsx`,
  `RatingScoreBar.jsx`, `ratingEligibility.js`.
- Формула и вся инфраструктура рейтинга из
  [`attendanceData.js`](../../src/utils/attendanceData.js): `RATING_STATUS`,
  `calculateShiftRatingEntries`, `aggregateEmployeeRating`,
  `calculateEmployeeRatingFromShifts`, `calculateRatingsByEmployee`,
  debug-логгеры, `SCORE_EVENT_TYPE`/`SCORE_EVENT_LABELS`,
  `RATING_BASE_SCORE`, `getRatingScoreColor`/`getRatingScoreGradient`. Файл
  общий с тайм-трекером — вырезано точечно, не удалён целиком.
- `clampRatingScore` переименован в `clampPercentScore` (используется
  «Здоровьем компании» на Главной — это уже не про рейтинг, просто клэмп
  0–100) — обновлены оба потребителя
  (`companyHealth.js`, `CompanyHealthGauge.jsx`).
- `RATING_UPDATED_EVENT`/`notifyRatingUpdated` переименованы в
  `ATTENDANCE_UPDATED_EVENT`/`notifyAttendanceUpdated` — по факту это была
  общая шина «изменилась посещаемость», используемая Главной для
  обновления дневных плиток, а не только рейтингом.
- Плитка «Рейтинг» на карточке профиля сотрудника
  (`EmployeeProfileSection.jsx`/`EmployeePeriodSummary.jsx`) — убрана,
  плитки «Опоздания»/«Ранние уходы» **оставлены**: это независимая
  факт-статистика (`employeePeriodSummary.js` → `employeeMonthlyWorkSummary.js`),
  никогда не зависела от формулы рейтинга.
- `AttendanceSettingsPanel.jsx` («Управление тайм-трекером») — убраны все
  7 полей баллов/штрафов, секция переименована «Допуски по времени»;
  допуски (опоздание/ранний уход/время ожидания ухода) **оставлены** — их
  читает дневная статистика на Главной (`OwnerDashboard.jsx`).
- `TimeTrackerViolationsJournal.jsx`, `TimeTrackerEscalationSettingsPanel.jsx`
  и их подключение в `PlatformSettingsNotifications.jsx` — удалены целиком.
- Deep-link баннер «Нарушение тайм-трекера» на Главной
  (`PlatformHome.jsx`, `?employee=&shift=&violation=`) — убран: это был
  единственный потребитель кликов по push-уведомлению эскалации, которых
  больше не будет, а ссылка «Журнал нарушений» вела бы в никуда.
- RBAC: `RATING_VIEW`/`rating.view`, модуль `rating`, легаси-алиас
  `employees.rating.view`, записи в `RBAC_DEFAULT_ROLE_PERMISSIONS` —
  убраны из [`permissionCatalog.js`](../../src/config/permissionCatalog.js);
  `EMPLOYEES_RATING`/`canViewEmployeeRating` — из
  [`permissions.js`](../../src/config/permissions.js); нав-пункт — из
  `platformNav.js`; маршрут `employees/rating` — из `App.jsx`.
- **Найденная ловушка**: легаси-роут `/platform/time-tracker` (просто
  редиректит на `/platform`) был защищён тем же самым правом
  `ROUTE_KEYS.EMPLOYEES_RATING` по историческому совпадению — перевешен на
  `ROUTE_KEYS.HOME`, иначе старые ссылки/deep-link’и сломались бы вместе с
  удалением права.

## 3. Что удалено — бэкенд

- `admin-team-workforce-data` Edge Function: вид `'rating'` убран из
  `ALLOWED_VIEWS`, `permissionCodesForView`, `resolveWorkforceScope`, тип
  `WorkforceView`.
- `_shared/adminEscalationLogic.ts`, `adminEscalationDispatch.ts`,
  `adminEscalationRecipients.ts`, `adminEscalationWarnings.ts` — удалены
  целиком (замкнутый кластер, использовался только друг другом и
  планировщиком).
- `_shared/timeTrackerNotificationScheduler.ts` — убран вызов
  `dispatchAdminEscalations`; вызов `dispatchTimeTrackerNotifications`
  (личные напоминания) остался как единственная функция планировщика.
- `run-time-tracker-notification-scheduler/index.ts` и
  `_shared/schedulerControlledRun.ts` (E2E-тестовый парсер тела запроса) —
  убраны все поля, связанные только с эскалацией
  (`escalation_only`, `escalation_events`, `recipient_employee_ids`,
  паттерн `TT-ADMIN-ESC-E2E` в `run_id`).
- `admin-notification-settings/index.ts` — убраны экшены
  `get_escalation_settings`/`update_escalation_settings`/`list_time_tracker_violations`;
  экшены персональных напоминаний (`get_settings`/`update_settings`,
  `TIME_TRACKER_RULE_CODES`) — не тронуты.
- `src/services/notificationSettingsAdminService.js` — убраны
  `fetchEscalationSettings`/`updateEscalationSettings`/`listTimeTrackerViolations`.

## 4. Миграция БД — написана, применение требует отдельного подтверждения

Файл:
[`supabase/migrations/20260901120000_remove_rating_and_admin_escalations.sql`](../../supabase/migrations/20260901120000_remove_rating_and_admin_escalations.sql).

**Preflight — реальные данные на боевой БД, проверено перед написанием
миграции:**

| Объект | Найдено |
|---|---|
| `permissions` (`code='rating.view'`) | 1 строка |
| `role_permissions` через `rating.view` | 7 грантов (удалятся каскадно) |
| `time_tracker_violations` | **95 строк** — реальный исторический журнал |
| `time_tracker_escalation_settings` | 1 строка (синглтон-конфиг) |
| `notification_templates` (эскалации) | 2 строки |
| `notification_rules` (эскалации) | 2 строки |
| Легаси-код `employees.rating.view` | 0 строк — только клиентский алиас, в БД никогда не было |

**Единственное необратимое действие** — удаление 95 строк исторического
журнала опозданий вместе с таблицей `time_tracker_violations`. Это
осознанная часть задачи («безопасно полностью удалить»), а не побочный
эффект — явно вынесено сюда, чтобы решение было на виду перед применением.

**Что делает миграция**, в безопасном порядке (сначала зависимые
`notification_rules`, потом `notification_templates`, из-за
`on delete restrict` на `template_id`):
1. `delete from permissions where code = 'rating.view'` — гранты в
   `role_permissions` уходят каскадно (`on delete cascade`).
2. Удаляет 2 строки `notification_rules` + 2 строки `notification_templates`
   для эскалаций. `public.notifications` (реальный инбокс) не трогается —
   его `template_id`/`rule_id` nullable с `on delete set null`, история
   доставленных уведомлений (если были) не пострадает, просто потеряет
   ссылку на удалённый шаблон.
3. `drop table` для `time_tracker_violations` и
   `time_tracker_escalation_settings`.
4. Убирает 7 колонок баллов/штрафов из `platform_attendance_settings`,
   оставляя допуски по времени (`late_grace_minutes`,
   `early_leave_grace_minutes`, `checkout_wait_minutes`) — их использует
   дневная статистика на Главной, не рейтинг.

**Применение** — через `npx supabase db query --linked --file <путь>` +
`npx supabase migration repair --linked --status applied <timestamp>` (тот
же метод, что использовался в этой сессии для предыдущих миграций) —
**только после явного подтверждения**, отдельно от написания файла.

**Постчек — выполнен, подтверждено:**

| Проверка | Результат |
|---|---|
| `permissions` (`rating.view`) | 0 строк |
| `notification_templates` (эскалации) | 0 строк |
| `notification_rules` (эскалации) | 0 строк |
| `time_tracker_violations` | таблица не существует |
| `time_tracker_escalation_settings` | таблица не существует |
| `platform_attendance_settings` колонок | 6 (id, 3 допуска, updated_by, updated_at) |

Применено через `npx supabase db query --linked --file ...` +
`npx supabase migration repair --linked --status applied 20260901120000`.
Все три Edge Function (`admin-team-workforce-data`,
`admin-notification-settings`, `run-time-tracker-notification-scheduler`)
передеплоены тем же способом, что и раньше в этой сессии
(`npx supabase functions deploy <имя> --project-ref cxadzerxndlscwvdaymk`).

## 5. Verify

```bash
npm run verify:rating-and-escalations-removal
npm run build
```

Новый скрипт (54 проверки): все удалённые файлы реально удалены; ноль
случайных ссылок на 28 удалённых идентификаторов по всему `src/` и
`supabase/functions/` (та же дисциплина, что поймала живой баг с `isCreate`
на поставщиках ранее в этой сессии); базовый тайм-трекер и логика
завершённых смен для зарплаты не тронуты; личные напоминания сотрудникам
живы; RBAC-каталог и Edge Function `admin-team-workforce-data` чисты;
миграция существует и содержит все ожидаемые операции; `package.json` без
повисших скриптов.

Дополнительно — browser mount-тест `EmployeePeriodSummary` +
`CompanyHealthGauge` на фабрикованных сменах: 4 карточки статистики без
«Рейтинга», здоровье компании считается корректно через переименованный
`clampPercentScore`, ошибок рендера нет.

Смежные verify-скрипты, читавшие удалённые файлы или проверявшие вид
`'rating'`, обновлены под новую реальность: `verify-loading-system.mjs`,
`verify-employee-position-role-separation.mjs`,
`verify-scheduler-controlled-run.mjs`,
`verify-team-workforce-admin-access.mjs` (включая живые интеграционные
проверки `view: 'rating' -> 200`, переведённые на `schedule`/`dashboard`).
Все прогнаны, статические части зелёные; `verify:loading-system` и
`verify:employee-position-role-separation` падают на тех же самых
преэкзистирующих пунктах, что и на чистом `main` до этой правки
(подтверждено `git stash`) — не регрессия.

## 6. Затронутые файлы

Слишком много для полного списка — см. `git status`/`git diff --stat`.
Ключевые: `src/utils/attendanceData.js`, `src/utils/companyHealth.js`,
`src/config/permissionCatalog.js`, `src/config/permissions.js`,
`src/platform/platformNav.js`, `src/App.jsx`,
`src/components/admin/AttendanceSettingsPanel.jsx`,
`src/pages/platform/PlatformHome.jsx`,
`src/pages/platform/PlatformSettingsNotifications.jsx`,
`supabase/functions/admin-team-workforce-data/index.ts`,
`supabase/functions/admin-notification-settings/index.ts`,
`supabase/functions/_shared/timeTrackerNotificationScheduler.ts`,
`supabase/functions/_shared/schedulerControlledRun.ts`,
`supabase/migrations/20260901120000_remove_rating_and_admin_escalations.sql`,
`scripts/verify-rating-and-escalations-removal.mjs`, этот файл.

**Требует передеплоя после мержа** (Edge Functions, код изменился):
`admin-team-workforce-data`, `admin-notification-settings`,
`run-time-tracker-notification-scheduler`.
