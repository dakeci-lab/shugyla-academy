# Аудит — нельзя очистить будущие смены после увольнения

**Направление:** только аудит (без правок кода, без миграций, без коммитов).  
**Дата:** 2026-08-20.  
**Кейс:** после увольнения в середине месяца будущие плановые смены («Рабочий день») нельзя привести к «Нет смены»; в зарплате «План» / фонд выглядят завышенными относительно фактически отработанного.

---

## Вердикт

Сегодня **нельзя удалить** плановую смену (день → отсутствие строки / «Нет смены»): в UI нет такого статуса и кнопки удаления, Edge `admin-manage-employee-schedule` умеет только `upsert_shift` / `bulk_upsert_shifts`, в enum БД нет статуса «пусто». «Нет смены» — это **отсутствие строки** в `academy_employee_shifts`, а не значение статуса. После увольнения (`terminated_at`) дни **строго после** даты увольнения ещё и **блокируются** для любой правки (`canEditEmployeeScheduleDate` / `shift_outside_employment`) — «хвосты» графика остаются на экране. Зарплата сменщиков считает **План/фонд** по статусу `working` внутри периода работы и **уже отсекает** строки с `shift_date > terminated_at`; реальный разрыв План ≫ Отработано чаще даёт неотработанные `working`-дни **вплоть до** даты увольнения включительно плюс визуальный шум от залоченных будущих дней. Процесса «уволить → очистить будущий график» нет: `deactivateEmployee` только ставит статус и `terminatedAt`.

---

## Доказательства

### UI и поток

| Что | Где |
|-----|-----|
| Карточка / график сотрудника | `EmployeeScheduleSection.jsx` (календарь, «Настроить график», карандаш дня) |
| Сетка месяца | `EmployeeScheduleCalendar.jsx` — при `shift == null` лейбл **«Нет смены»** (`shift-day--empty`) |
| Модалка дня | `ShiftDayEditModal.jsx` — select из `SHIFT_STATUS_OPTIONS` |
| Массовая настройка | `BulkScheduleModal.jsx` → `buildBulkShiftEntries` (working / day_off, без delete) |
| Сохранение | `useScheduleBackgroundSync` → `upsertEmployeeShift` / `bulkApplyEmployeeShifts` |

### Статусы дня

```text
SHIFT_STATUS / БД check:
  working | day_off | vacation | sick_leave | absence

SHIFT_STATUS_OPTIONS (модалка): те же пять — пункта «Нет смены» нет.

«Нет смены» = нет записи на дату (UI-only в календаре).
```

Файлы: `src/utils/shiftData.js` (`SHIFT_STATUS`, `SHIFT_STATUS_LABELS`, `SHIFT_STATUS_OPTIONS`); constraint в `supabase/migrations/add_employee_shifts.sql`.

### Модель данных

| Слой | Детали |
|------|--------|
| Таблица | `public.academy_employee_shifts` — `unique(employee_id, shift_date)` |
| План | `status`, `planned_start_time` / `planned_end_time` (+ break) |
| Факт | `actual_start_time` / `actual_end_time` (+ geo check-in/out) |
| Сотрудник | `academy_users.status`, `hired_at`, `terminated_at` |

### Запись графика

| Компонент | Поведение |
|-----------|-----------|
| Edge | `supabase/functions/admin-manage-employee-schedule/index.ts` — **только** `upsert_shift`, `bulk_upsert_shifts` |
| Shared | `_shared/employeeScheduleWrite.ts` — `ALLOWED_SHIFT_STATUSES`, `canEditEmployeeScheduleDate`, `assertScheduleChangeAllowed` |
| Cloud adapter | `shiftSupabaseAdapter.js` — invoke Edge; **нет** delete |
| Local adapter | `shiftLocalAdapter.js` — upsert; employment guard; **нет** delete |
| RLS | `authenticated` — в основном **select own**; запись через **service_role** в Edge (`20260714210000_…phase2.sql`) |

Комментарий в Edge: правки уволенным **разрешены**, но только для дат внутри окна hire…termination — не «очистка хвоста».

### Увольнение

| Действие | Код | График |
|----------|-----|--------|
| «Уволить» | `deactivateEmployee` → `employmentStatus: terminated`, `terminatedAt: today` | **не трогает** смены |
| Восстановить | `restoreEmployee` → active, `terminatedAt: null` | смены не восстанавливает/не чистит |

### Блокер «день → Нет смены»

| Слой | Есть ли delete / clear? |
|------|-------------------------|
| UI модалки | Нет |
| Bulk | Нет (только upsert working/day_off) |
| API Edge | Нет action delete |
| БД enum | Нет статуса «none»; пустота = delete row |
| Бизнес-правило после увольнения | Дни `> terminated_at` **нельзя** даже upsert’ить → хвосты `working` остаются навсегда через UI |

---

## Таблица: что можно / нельзя со сменой сегодня

| Действие | До увольнения (дата в окне) | После увольнения, дата ≤ `terminated_at` | Дата > `terminated_at` |
|----------|----------------------------|------------------------------------------|-------------------------|
| Создать / изменить `working` | Да (upsert) | Да | Нет (`shift_outside_employment`, UI locked) |
| Сменить на `day_off` / отпуск / больничный / неявка | Да | Да* | Нет |
| Удалить строку → «Нет смены» | **Нет** | **Нет** | **Нет** |
| Bulk «Настроить график» (working / day_off) | Да, даты клипаются по employment | Да, в пределах окна | Даты вне окна пропускаются |
| Автоочистка при «Уволить» | — | — | **Нет** |

\*Смена с фактом check-in/out: смена `working` → не-working требует подтверждения в UI (`isDestructiveScheduleChange`); Edge без confirm может ответить `shift_has_attendance_history` (409).

---

## «Нет смены» vs «Выходной» vs отсутствие строки — зарплата

Общий счётчик: `summarizeEmployeeMonthlyWork` / `buildPayrollShiftStatsByEmployee`  
(`employeeMonthlyWorkSummary.js`, `salaryPayroll.js`).

| Состояние дня | Строка в БД | Входит в **План** (`assigned` / `plannedShifts`)? | Входит в **Отработано** (`completed`)? |
|---------------|-------------|---------------------------------------------------|----------------------------------------|
| «Нет смены» | нет | Нет | Нет |
| `day_off` / vacation / sick_leave / absence | есть | Нет (`isWorkingShiftStatus` только `working`) | Нет |
| `working` без check-in/out | есть | **Да** | Нет |
| `working` + completed tracker | есть | **Да** | **Да** |
| `working`, но `shift_date > terminated_at` | есть (хвост) | **Нет** (clip `isShiftEligibleForMonthlyWork`) | Нет |

Смысл для сменщиков в ведомости:

- **Фонд / «План»** = `shift_rate × assigned` (`computePayrollFundAmount`)
- **К выдаче / «Отработано»** = `shift_rate × completed` (`computePayrollEarnedBase`)

Для **назначенных смен** `day_off` и отсутствие строки эквивалентны (оба не в `assigned`). Разница — календарь/командный график и невозможность сейчас получить именно пустую ячейку без delete.

---

## Корневая причина

Смешение трёх дыр, не один баг UI:

1. **Модель + API:** смена = upsert-only; «пусто» не представлено статусом и не удаляется.  
2. **UI:** дропдаун без «Нет смены» / «Удалить»; тексты про удаление есть только в destructive-confirm, пути delete нет.  
3. **Процесс увольнения:** дата `terminated_at` **запирает** будущие дни и **не чистит** уже созданные строки.  
4. **Зарплата (частично уже учтена):** пост-termination `working` не должны раздувать План при корректном `terminatedAt`; визуально и в «хвосте до даты увольнения» разрыв План/Факт остаётся.

Итоговая формулировка: **нет операции clear/delete + нет шага очистки при увольнении + lock дат после `terminated_at`**. Не «сломалась зарплата сама по себе», а график нельзя привести к ожидаемому пустому состоянию.

---

## Рекомендуемые направления фикса (без реализации)

1. **Delete / clear дня в UI + Edge**  
   Action `delete_shift` (или upsert запретить, отдельный delete). Модалка: «Нет смены» / «Удалить смену» → DELETE row. Для дней с attendance — жёсткий confirm / запрет. Даёт настоящую пустую ячейку.

2. **Bulk «Очистить график с даты»**  
   На карточке сотрудника: с `fromDate` удалить (или проставить согласованный non-working) будущие планы без факта. Узкий HR-инструмент под кейс увольнения.

3. **Автоочистка при увольнении**  
   В `deactivateEmployee` / admin-update: после записи `terminated_at` удалить (или day_off) строки с `shift_date > terminated_at` без attendance. Один UX-шаг «Уволить».

4. **Только статус / копирайт (слабее)**  
   Добавить в модалку путь «как выходной» + подсказку; **не** решает залоченные дни после `terminated_at` и не даёт «Нет смены» без delete. Имеет смысл лишь как временный обход **до** даты увольнения.

Предпочтение для этапа 2: комбинация **(1) или (2)** + опционально **(3)** — иначе хвосты после увольнения останутся недоступны для правки.

---

## Вне скоупа

- Баги закупа / Planning «Сегодня» / UMAG  
- Пересчёт формулы «платить по плану вместо факта» (сейчас к выдаче уже по completed)  
- Унификация таймзон графика vs Almaty Planning  
- Массовое увольнение всей смены / импорт Excel  
- Изменение RLS так, чтобы клиент писал в смены напрямую  

---

## Риски (учесть в этапе 2)

| Риск | Суть |
|------|------|
| Факт на прошедших днях | Delete/day_off при check-in/out ломает историю и рейтинг; уже есть guard `shift_has_attendance_history` |
| Ночные смены | Учёт по `shift_date` (дата начала); чистить «хвост» по календарной дате, не по концу смены |
| День увольнения | Окно **включительно** до `terminated_at`: смена в день увольнения остаётся editable и может входить в План |
| Фонд vs к выдаче | Даже после clip пост-termination «План» на экране ведомости может быть > «Отработано» за счёт неявок/недобора факта внутри периода |
| Восстановление сотрудника | Restore не воскрешает удалённые смены — если автоочистка при увольнении, нужен явный warning |

---

## Вопросы владельцу для этапа 2 (макс. 6)

1. Очищать **только будущие** дни после даты увольнения или также ближайшие дни **без** check-in/out внутри периода работы?  
2. Зарплате достаточно статуса **«Выходной»** (строка остаётся) или нужно именно **отсутствие смены** (delete)?  
3. Нужна ли на карточке кнопка **«Очистить график с даты…»** (один сотрудник), отдельно от «Уволить»?  
4. Увольнение и очистка графика — **одним действием** или двумя явными шагами?  
5. Дни **с фактом** тайм-трекера: никогда не трогать / только с супер-подтверждением / разрешить admin override?  
6. Если `terminated_at` уже в прошлом и хвосты `working` висят — нужен ли **разовый repair** (скрипт/кнопка «убрать смены после увольнения») для текущих уволенных?

---

## Инвентарь call site’ов (create / update / delete)

| # | UI / вход | Сервис | БД / Edge | Create | Update | Delete |
|---|-----------|--------|-----------|--------|--------|--------|
| 1 | `ShiftDayEditModal` → `EmployeeScheduleSection.handleSaveShift` | `enqueueSave` → `upsertEmployeeShift` | Edge `upsert_shift` | upsert | upsert | — |
| 2 | `BulkScheduleModal` → `handleBulkApply` | `enqueueBulkSave` → `bulkApplyEmployeeShifts` | Edge `bulk_upsert_shifts` | upsert | upsert (если overwrite) | — |
| 3 | Командный график / другие админ-экраны (если пишут смены) | те же adapters | тот же Edge | upsert | upsert | — |
| 4 | Тайм-трекер check-in/out | `employee-time-tracker-action` / SQL functions | UPDATE actual_* | — | факт | — |
| 5 | «Уволить» | `deactivateEmployee` / `updateEmployeeAsAdmin` | `academy_users` | — | status + terminated_at | смены не трогает |
| 6 | Прямой DELETE смены из приложения | — | — | — | — | **нет call site** |

Чтение для зарплаты/профиля: `admin-team-workforce-data` (payroll) / `fetchEmployeeWorkforceBundle` (schedule) → `summarizeEmployeeMonthlyWork` с clip по `terminatedAt`.
