# Зарплата — аудит фильтров, удаление мёртвого «Этапа расчёта», один чекбокс вместо «Статуса расчёта»

## 0. Статус: реализовано, проверено сборкой + verify-скриптом + браузерным mount-тестом

## 1. Контекст

Владелец готовится дорабатывать раздел «Зарплата» и попросил сначала провести аудит структуры/логики, прежде чем что-либо менять. В фильтре ведомости было два места, вызывавших вопросы:

- **«Этап расчёта»** (Все / Без расчёта / Черновик / На проверке / Подтверждено / Выплачено) — показалось лишним усложнением.
- **«Статус расчёта»** (Все / Активные / Исключённые) — реальная функция, но подписана тем же словосочетанием, что и «Этап расчёта», легко перепутать.

Аудит (два параллельных исследования кода — фронтенд и БД/сервисный слой — плюс собственная проверка ключевых файлов) подтвердил оба наблюдения.

## 2. Находка: «Этап расчёта» — полностью мёртвая механика

Колонка `salary_records.status` (`draft/review/confirmed/paid`) существует в БД, но каждая запись создаётся строго со статусом `draft` (`ensureSalaryRecord`, `src/services/salaryPayrollService.js`) и никогда никуда не переходит в реальном UI. Единственный код, который мог менять статус — выпадающий список в `PayrollRecordSection.jsx` + `saveSalaryRecordFull()` — стал недостижим ещё в прошлом рефакторинге (`63e934e feat(payroll): edit salary ledger in-table without employee cards`): маршрут `/platform/employees/payroll/records/:recordId` теперь просто редиректит обратно в список («Карточка расчёта больше не используется — вся работа в ведомости»). Собственный verify-скрипт проекта уже явно проверял, что статуса в списке быть не должно и что карточка редиректит — решение уже было принято командой раньше, просто фильтр и мёртвый код остались.

**Убрано:**
- Секция «Этап расчёта» из [`PayrollFilterPopover.jsx`](../../src/components/admin/payroll/PayrollFilterPopover.jsx) целиком.
- `SALARY_RECORD_STATUSES`/`getSalaryStatusMeta` из [`salaryPayroll.js`](../../src/utils/salaryPayroll.js).
- Файлы `PayrollRecordSection.jsx`/`.css` — подтверждённо недостижимый код (ноль импортов во всём репозитории).
- `saveSalaryRecordFull()` в `salaryPayrollService.js` — единственный вызывающий был в удалённом файле.
- `getPayrollRecordPath()` в `salaryPayroll.js` — ноль вызовов во всём репозитории (даже редирект-роут его не использовал, только `getPayrollListPath()`).

**Оставлено сознательно:**
- `resolvePaidAmount()`'s `record.status === 'paid'` — безобидный legacy-фолбэк для записей, у которых `paid_amount` мог не быть проставлен до соответствующей миграции.
- Маршрут `/platform/employees/payroll/records/:recordId` → редирект в список — двух строк кода, безопасная сетка для старых ссылок.
- Колонка `salary_records.status` в БД и её check-constraint — фронтенд просто перестаёт с ней взаимодействовать; удаление колонки (более рискованная миграция) — отдельный PR, если вообще понадобится.

## 3. Находка: «Статус расчёта» (Активные/Исключённые) — реальная функция, спутана по названию

Булево поле `academy_users.payroll_participation` (`active|excluded`), независимое от даты приёма/увольнения — прячет сотрудника из ведомости без изменения его статуса занятости. Владелец подтвердил желаемое поведение: **один чекбокс** вместо трёх кнопок, тот же паттерн, что уже реализован для поставщиков в этой же сессии (`SupplierFilterPopover.jsx`, «Показать удалённых поставщиков»).

**Изменено:**
- `PAYROLL_PARTICIPATION_FILTER_OPTIONS` (все/активные/исключённые) в
  [`employeeData.js`](../../src/utils/employeeData.js) заменён на
  `PAYROLL_LIST_DEFAULT_SHOW_EXCLUDED = false`.
- `PayrollFilterPopover.jsx` — радиогруппа заменена на один чекбокс
  «Показать исключённых из ведомости»: снят → видны участвующие
  (действующие) сотрудники, отмечен и применён → видны только
  исключённые. Использует уже существовавший чистый хелпер
  `isPayrollExcluded(employee)`.
- `PayrollSection.jsx` — state `appliedParticipation`/`draftParticipation`
  → `appliedShowExcluded`/`draftShowExcluded` (boolean); фильтрация строк
  теперь `isPayrollExcluded(emp) === appliedShowExcluded`, тем же
  паттерном, что `matchesSupplierArchiveFilter` у поставщиков.
- Переименована подпись, чтобы не путать с удалённым «Этапом расчёта»:
  «Статус расчёта» → **«Участие в ведомости»** в модалке
  [`PayrollCommentModal.jsx`](../../src/components/admin/payroll/PayrollCommentModal.jsx)
  (заголовок и подпись поля) и в
  [`EmployeeEditModal.jsx`](../../src/components/admin/employees/EmployeeEditModal.jsx).
  Сам select (Активный/Исключён) и кнопка «Исключить из расчёта» с
  подтверждением — не тронуты, только подпись.

## 4. Не тронуто (подтверждено владельцем, менять не нужно)

Прочерки в текущем месяце — не баг: строка получает данные, только когда
админ впервые кликает в неё (ставка/аванс/начисления/удержания), тогда
создаётся `salary_records` с нулями. Автоматического «открытия» месяца
нет и не запрашивалось.

## 5. Verify

```bash
npm run verify:salary-payroll-mvp
npm run build
```

`verify:salary-payroll-mvp` — 61 проверка (было ~48 до этой правки),
включая новые стадии «Dead record-card component removed» и «"Этап
расчёта" removed / "Статус расчёта" simplified». Заодно поправлены два
других verify-скрипта, которые читали теперь удалённый
`PayrollRecordSection.jsx` (`scripts/verify-loading-system.mjs` — запись
в списке мигрированных на общий скелетон-компонент,
`scripts/verify-employee-position-role-separation.mjs` — проверка
использования `getEmployeePositionDisplay`) — без этой правки оба упали
бы с `ENOENT` на несуществующий файл. Оба скрипта после правки доходят до
своих собственных, не связанных с этой задачей, преэкзистирующих
падений (подтверждено `git stash` до начала работы) — не регрессия.

Дополнительно — браузерный mount-тест `PayrollFilterPopover` +
`PayrollCommentModal` на фабрикованных данных (один участвующий и один
исключённый сотрудник): подтверждено, что чекбокс переключает видимый
набор без ошибок рендера, и что обе модалки показывают новую подпись
«Участие в ведомости»/«Комментарий и участие в ведомости».

Полный grep-проход по `src/` на предмет забытых ссылок на удалённые
идентификаторы (`appliedStatus`, `draftStatus`, `SALARY_RECORD_STATUSES`,
`getSalaryStatusMeta`, `PAYROLL_PARTICIPATION_FILTER_OPTIONS`,
`draftParticipation`, `appliedParticipation`, `saveSalaryRecordFull`,
`getPayrollRecordPath`, `PayrollRecordSection`) — обязательный шаг после
недавнего живого регресса на поставщиках (забытая ссылка на убранный
`isCreate` уронила весь раздел в проде); ноль совпадений.

## 6. Затронутые файлы

Изменены: `src/components/admin/payroll/PayrollFilterPopover.jsx`,
`src/components/admin/payroll/PayrollSection.jsx`,
`src/components/admin/payroll/PayrollCommentModal.jsx`,
`src/components/admin/employees/EmployeeEditModal.jsx`,
`src/components/admin/employees/EmployeeFilterPopover.css`,
`src/utils/salaryPayroll.js`, `src/utils/employeeData.js`,
`src/services/salaryPayrollService.js`,
`scripts/verify-salary-payroll-mvp.mjs`,
`scripts/verify-loading-system.mjs`,
`scripts/verify-employee-position-role-separation.mjs`, этот файл.

Удалены: `src/components/admin/payroll/PayrollRecordSection.jsx`,
`src/components/admin/payroll/PayrollRecordSection.css`.

Миграций БД нет — задача полностью фронтенд/JS.

Дальнейшие доработки раздела «Зарплата» (то, ради чего затевался аудит) —
отдельным шагом, по мере того как владелец будет решать, что делать
дальше.
