# Карточка и список сотрудников — статус рядом с ФИО, фильтр-чекбокс, без колонки «Статус»

## 0. Статус: реализовано, готово к проверке в браузере (2026-09-01)

## 1. Задача (три пункта от владельца, по скриншотам)

1. В карточке сотрудника (`/platform/employees/:id`) бейдж «Работает»/«Уволен»
   стоял отдельным блоком под должностью — занимал лишнюю строку по высоте.
   Перенести бейдж рядом с ФИО, чтобы карточка стала компактнее по вертикали.
2. Фильтр «Статус» в списке сотрудников (Все / Работает / Уволен) заменить
   одним чекбоксом «Показать уволенных сотрудников» — тот же паттерн, что уже
   применён для поставщиков («Показать удалённых поставщиков») и ведомости
   («Показать исключённых из ведомости») в этой сессии. Отмечен и применён →
   видны только уволенные; снят и применён → видны только работающие.
3. В общем списке сотрудников (таблица + мобильные карточки) убрать колонку
   «Статус» — с чекбоксом-фильтром она избыточна: пользователь и так знает,
   какой срез смотрит.

## 2. Изменения

- **`src/components/admin/employees/EmployeeProfileHeader.jsx`** —
  `StatusBadge` перенесён из отдельного `<div className="…__status">` в новую
  строку `<div className="employee-profile-header__name-row">` рядом с
  `<h1>{employee.name}</h1>`.
- **`EmployeeProfileHeader.css`** — добавлено правило `__name-row` (flex,
  `align-items: center`, `gap`, `flex-wrap` для длинных ФИО на узких экранах);
  правило `__status` (margin-top отдельного блока) удалено — карточка стала
  короче ровно на высоту убранной строки.
- **`src/components/admin/employees/EmployeeFilterPopover.jsx`** — радиогруппа
  «Статус» (Все/Работает/Уволен, `role="radiogroup"`) заменена на один
  чекбокс `.employee-filter-popover__checkbox-row` с подписью «Показать
  уволенных сотрудников». `checked = draftStatus === 'deactivated'`,
  `onChange` передаёт `'deactivated'` или `'active'` через тот же
  `onStatusChange` — проп наружу не переименован, чтобы не трогать
  `EmployeesSection.jsx` сверх необходимого.
- **`src/utils/employeeData.js`** — убран `EMPLOYEE_LIST_STATUS_FILTER_OPTIONS`
  (каталог для радиогруппы, вариант `all` был единственным потребителем этого
  значения на UI-уровне). `formatEmployeeFilterCount` упрощён до двух веток
  (`deactivated` / по умолчанию `active`) — ветка `all` была недостижима
  из интерфейса.
- **`src/components/admin/sections/EmployeesSection.jsx`** —
  `mapFilterToListStatus` упрощена до `filter === 'deactivated' ? 'deactivated' : 'active'`
  (ветка `'all'` была мертва после удаления radiogroup-опции «Все»; отдельный
  внутренний sentinel `status: 'all'`, которым уже отфильтрованные cloud-данные
  не фильтруются повторно клиентски, не тронут — это другой, независимый
  смысл той же строки). Состояния `appliedStatus`/`draftStatus` не
  переименованы: они как хранили `'active'`/`'deactivated'`, так и хранят —
  просто UI больше не даёт установить `'all'`.
- **`src/components/admin/employees/EmployeeListTable.jsx`** — колонка
  «Статус» убрана из десктопной таблицы (`<col>`, `<th>`, `<td><StatusBadge>`)
  и из мобильных карточек (`StatusBadge` в `employee-card-item__head-actions`).
  Импорты `StatusBadge`, `getEmploymentStatusLabel`, `getEmploymentStatusBadgeType`
  удалены как более не используемые в файле.
- **`EmployeeListTable.css`** — правило ширины `__col-status` удалено.

## 2.1 Доп. правка (тот же день) — убрать дублирование должности/группы/роли в карточке

Владелец прислал скриншот карточки: подпись под ФИО и строка «Должность» в
метаблоке показывали одно и то же значение (`headerPosition` — позиция),
а строка «Роль в системе» в метаблоке дублировала значение, которое
концептуально должно быть подписью под ФИО. Плюс строка «Группа должности»
не нужна на карточке вовсе (используется только для сортировки/фильтрации
в общем списке — там, в колонке таблицы, не тронута).

Итоговая раскладка карточки:
1. Подпись сразу под ФИО (`employee-profile-header__role`, без ярлыка,
   как и раньше) — теперь показывает **роль в системе** (`systemRoleLabel`)
   вместо должности.
2. Строка «Должность» в метаблоке — **не тронута**, показывает то же, что
   и раньше (`positionLabel`/`headerPosition`).
3. Строка «Группа должности» в метаблоке — **удалена** (`groupLabel` и
   импорт `getEmployeePositionGroupLabel` тоже убраны как более не нужные).
4. Строка «Роль в системе» в метаблоке — **удалена** (дубликат подписи
   под ФИО из пункта 1).

Правка только в `EmployeeProfileHeader.jsx` — общий компонент, значит
применяется сразу ко всем карточкам сотрудников. CSS не менялся: блок
сократился сам за счёт двух убранных строк.

`scripts/verify-employee-position-role-separation.mjs` (Stage 4, из более
ранней задачи в истории проекта) содержал устаревшие проверки
`profile shows группа` / `profile shows роль в системе`, ожидавшие обратного —
заменены на `profile no longer shows separate группа row` /
`...роль в системе row` + новую `profile subtitle under name shows role, not position`.
Полный прогон скрипта уже был красным до этой правки из-за несвязанной
причины (`hire prefill clears positionId` — код давно перешёл на
`applyPrefill(positionId = '')` вместо литерала, который ищет старый ассерт;
воспроизведено на `git stash` — баг существовал уже в закоммиченном `main`
до этой сессии), поэтому три новых/изменённых ассерта проверены отдельным
изолированным запуском (см. вывод в истории сессии), а не полным прогоном
скрипта. Несвязанный существующий баг не исправлялся — вне периметра этой
задачи.

Браузерный mount-тест (тот же временный `/dev-sandbox-employees`,
удалён после проверки) на фиктивном сотруднике «Нурасыл Султанбай» /
роль «Закупщик» / должность «Закупщик / категорийный менеджер» — подтвердил
визуально: под ФИО «Закупщик» (роль), в метаблоке только «Должность»,
«Принят на работу», «Режим работы», «Тип расчёта зарплаты» — карточка
заметно короче.

## 3. Не тронуто

- Сам механизм статуса (`employmentStatus`, `getEmploymentStatusLabel/BadgeType`,
  RLS, серверная фильтрация `listEmployeesForAdmin`/`loadAllEmployeesForClientSearch`
  по `status: 'active'|'deactivated'`) — не менялся, только его представление
  в фильтре и в списке.
- `.employee-filter-popover__options`/`__option` CSS-классы — используются
  `PayrollFilterPopover.jsx` для выбора периода, оставлены как есть.
- Действия «Уволить»/«Восстановить» в `EmployeeEditModal` — вне периметра.

## 4. Verify

```bash
npm run verify:employees-list
npm run build
```

`verify-employees-list.mjs` дополнен: было `filter contains status`
(искало слово «Статус» — стало ложно-провальным после замены на чекбокс),
заменено на `filter has show-terminated checkbox` +
`filter checkbox is boolean, not a status radiogroup`; добавлен Stage 7
(5 новых проверок): бейдж и имя в одном ряду, старый `__status`-блок
отсутствует, колонки «Статус» нет ни в `<th>`, ни в CSS-ширинах, импорт
`StatusBadge` в таблице отсутствует. Итог — 89/89.

Браузерный mount-тест (временный роут `/dev-sandbox-employees` +
временный файл `DevSandboxEmployees.jsx`, оба удалены после проверки) —
`EmployeeProfileHeader` для активного и уволенного сотрудника (бейдж рядом
с ФИО на обоих скриншотах), `EmployeeListTable` с двумя сотрудниками (колонки
«Статус» нет ни в таблице, ни в карточках), `EmployeeFilterPopover` — клик по
чекбоксу переключает подпись счётчика «Работает: N» → «Уволен: N», ошибок
в консоли на чистой вкладке нет.

## 5. Затронутые файлы

Изменены: `src/components/admin/employees/EmployeeProfileHeader.jsx`,
`src/components/admin/employees/EmployeeProfileHeader.css`,
`src/components/admin/employees/EmployeeFilterPopover.jsx`,
`src/components/admin/employees/EmployeeListTable.jsx`,
`src/components/admin/employees/EmployeeListTable.css`,
`src/components/admin/sections/EmployeesSection.jsx`,
`src/utils/employeeData.js`,
`scripts/verify-employees-list.mjs`,
`scripts/verify-employee-position-role-separation.mjs`.

Новое: этот файл.

Не создано в БД ничего — задача полностью фронтенд, миграций нет.
