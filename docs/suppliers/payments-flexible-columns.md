# «К оплате» — гибкие столбцы (resize/reorder/показать-скрыть) + «Дата приёмки»

## 0. Статус: реализовано (2026-09-06)

## 1. Задача

Продолжение [payments-redesign-filter-flags.md](./payments-redesign-filter-flags.md).
Владелец попросил:

1. Новый столбец **«Дата приёмки»** после «Поставщик», порядок:
   Поставщик → Дата приёмки → Статус → Срок → Сумма.
2. Столбцы должны стать **гибкими** — тот же стандарт функциональности, что
   уже есть в «Планировании»: изменение ширины (drag за правый край),
   перестановка местами (drag заголовка), показать/скрыть через шестерёнку.

## 2. Архитектурное решение

В «Планировании» этот механизм состоит из двух слоёв:

- **Хранение** — `user_table_settings` (Supabase, ключ
  `auth_user_id + table_name`, сервис `tableSettingsService.js` /
  `getTableSettings`/`saveTableSettings`) — **уже полностью универсальный
  механизм**, не завязанный на закуп. Переиспользован как есть — «К
  оплате» получила свой `tableName = 'supplier_payments_list'`, без новой
  миграции.
- **Логика столбцов** (`plannerColumnSettingsMerge.js` +
  `procurementPlannerColumnRegistry.js`) — плотно завязана на конкретную
  таблицу Планирования: жёстко зашиты «закреплённые слева блоком»/
  «закреплённый справа один»/«фиксированный хвост» колонки именно этой
  таблицы (rowNum/product/barcode слева, orderQty справа, supplier
  хвостом). Переиспользовать этот файл для другой таблицы означало бы
  редактировать код, уже отлаженный и используемый в проде Планированием —
  риск регрессии там ради фичи здесь.

**Решение**: тот же UX-стандарт (шестерёнка, resize-хендл, drag-заголовки,
`user_table_settings`), но свой, отдельный и более простой реестр —
только 2 закреплённых конца (Поставщик первым, Сумма последней), без
универсальности «Планирования», которая тут просто не нужна (5 колонок
вместо десятков).

## 3. Новые файлы

- **`src/utils/paymentsColumnRegistry.js`** — реестр 5 колонок
  (`supplier`, `receivedAt`, `status`, `dueDate`, `amount`), у каждой
  `label`/`defaultWidth`/`minWidth`; `supplier` и `amount` — `locked: true`
  (не скрываются, не перетаскиваются). `SUPPLIER_PAYMENTS_TABLE_NAME =
  'supplier_payments_list'`.
- **`src/utils/paymentsColumnSettingsMerge.js`** — `mergePaymentsColumnSettings`
  (сохранённые настройки + реестр → неизвестные ключи отбрасываются, новые
  добавляются, ширина зажимается по `minWidth`), `enforceLockedPaymentsColumnOrdinals`
  (Поставщик первым, Сумма последней, середина — как есть),
  `reorderTogglablePaymentsColumns` (drag одной из трёх свободных колонок),
  `normalizePaymentsColumnSettingsForSave`, `getVisiblePaymentsColumns`.
  Тот же концептуальный API, что у `plannerColumnSettingsMerge.js`, но
  без универсальности под несколько типов закрепления.

## 4. Изменения в `SupplierPaymentsPanel.jsx` / `.css`

- Состояние `columnSettings` (+ `columnSettingsOpen`, `dragColumnName`,
  `dropColumnName`, `resizeStateRef`) загружается из `user_table_settings`
  при монтировании (только в `embedded`-режиме — standalone-карточки не
  участвуют, у них нет табличного вида).
- `handleColumnResizePointerDown/Move/Up` — тот же паттерн, что у
  Планирования: `pointerdown` на резайз-хендле фиксирует стартовую
  ширину, `pointermove` на `window` двигает, `pointerup` сохраняет через
  `saveTableSettings`.
- `handleColumnDragStart/Over/Drop/End` — нативный HTML5 drag-and-drop
  (`draggable`), как в Планировании; локальные колонки (`supplier`,
  `amount`) не являются `draggable` вовсе.
- Шестерёнка (`PaymentsColumnSettingsIcon`, локальная SVG-копия иконки из
  Планирования) открывает попап с чекбоксами только для 3 переключаемых
  колонок + кнопка «По умолчанию».
- `CompactColumnsHead`/`CompactObligationRow`/`MissingTermsBanner`
  перестали быть «4 захардкоженных `<span>`» — теперь рендерят
  `visibleColumns.map(...)`, а конкретную ячейку строит
  `renderPaymentsCell(columnName, group, todayKey)`.
- Ширина столбцов передаётся как CSS-переменная `--spo-compact-cols`
  (а не напрямую `grid-template-columns` инлайн-стилем) — это специально,
  чтобы мобильный `@media (max-width: 640px)` мог полностью
  переопределить раскладку литералом `minmax(0, 1fr) auto`, не заботясь о
  десктопном инлайн-стиле: инлайн-стиль лишь выставляет значение
  переменной, а какое правило её использует — решает обычный каскад.
  Колонка «Поставщик» всегда `minmax(0, 1fr)` (тянется), остальные —
  фиксированные `px`.

### «Дата приёмки»

Одна строка списка может объединять несколько приёмок с одним и тем же
сроком оплаты (см. `buildPaymentScheduleView` — группировка по
`(due_date, supplier)`, не по документу). `formatReceivedAt(group)`:
- `group.count === 1` → дата из `group.obligations[0]`
  (`sourceDocTime`/`supplyDocumentDate`, тот же `formatUmagDate`, что и в
  `GroupDetail`);
- `group.count > 1` → `formatReceptionCount(group.count)` («3 приёмки») —
  уже существующий хелпер, использовался в модалке.

## 5. Не тронуто

- `procurementPlannerColumnRegistry.js`/`plannerColumnSettingsMerge.js`/
  `ProcurementPlannerView.jsx` — не изменены ни строкой.
- Мобильная карточная раскладка (`@media max-width:640px`) — гибкие
  столбцы там не действуют (десктопная функция), toolbar с шестерёнкой
  скрыт.
- `ObligationCard`/standalone-режим (`/platform/supplier-payments`) — не
  затронуты, там нет табличного вида вовсе.

## 6. Verify

```bash
npm run verify:supplier-payments-column-settings
npm run verify:supplier-finance-compact-payments
npm run verify:supplier-finance-embeddable-panels
npm run build
```

Новый скрипт (15/15): порядок и локи реестра, merge/hide/reorder/resize/
clamp/очистка неизвестных колонок (чистая логика, без React), персист
через тот же `user_table_settings`, отсутствие импорта
Procurement-специфичного модуля, `formatReceivedAt`'s поведение при
count>1, рендер через `visibleColumns.map`, наличие resize/drag
хендлеров, и что мобильный медиа-запрос не ссылается на
`--spo-compact-cols` (десктопная функция не может просочиться в мобильную
раскладку).

Два существующих скрипта (`verify-supplier-finance-compact-payments`,
`verify-supplier-finance-embeddable-panels`) содержали проверку «Case 1:
embedded рендерит CompactPaymentSchedule первым узлом» как regex с
окном символов — при добавлении портала фильтра/шестерёнки перед
таблицей окно перестало хватать. Заменено на проверку по индексам
подстрок (позиция `<CompactPaymentSchedule` должна быть до начала
standalone-ветки), что переживёт будущий рост embedded-ветки без
подгонки чисел.

Браузерный mount-тест (временный экспорт `CompactColumnsHead`/
`CompactPaymentSchedule`, временный роут, оба убраны после проверки) на
фиктивных данных: колонки в правильном порядке; заголовки жирные;
«СПК товары» (1 приёмка) показывает дату «13.08.2026», «Ленгерское»
(3 приёмки) показывает «3 приёмки»; resize за правый край хендла реально
расширяет колонку (проверено drag-жестом); чекбокс в шестерёнке скрывает
столбец «Статус» и сетка/пилюли перестраиваются корректно; ошибок в
консоли нет. Reorder через нативный HTML5 drag-and-drop не удалось
проверить автоматизацией браузера (синтетические мышиные жесты не
запускают `dragstart`/`dragover`/`drop` без настоящего OS-уровня
перетаскивания) — сама логика перестановки (`reorderTogglablePaymentsColumns`)
проверена отдельно юнит-тестом (see Stage 2 above), а разводка событий
скопирована 1:1 с уже работающего в проде паттерна Планирования.

## 7. Затронутые файлы

Новое: `src/utils/paymentsColumnRegistry.js`,
`src/utils/paymentsColumnSettingsMerge.js`,
`scripts/verify-supplier-payments-column-settings.mjs`, этот файл.

Изменены: `src/components/suppliers/payments/SupplierPaymentsPanel.jsx`,
`src/components/suppliers/payments/SupplierPaymentsPanel.css`,
`scripts/verify-supplier-finance-compact-payments.mjs`,
`scripts/verify-supplier-finance-embeddable-panels.mjs`.

Миграций и Edge Function нет — `user_table_settings` уже существует и
уже используется Планированием.
