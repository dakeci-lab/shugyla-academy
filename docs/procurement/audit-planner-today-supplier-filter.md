# Аудит — фильтр «Сегодня» в Закупки → Планирование

**Направление:** только аудит (без правок кода, без миграций, без коммитов).  
**Дата:** 2026-08-20.  
**Кейс:** поставщик «TOO Kezi» (дни заказа — среда, дни доставки — четверг) появляется в пикере поставщика при фильтре «Сегодня», когда сегодня четверг.

---

## Вердикт

Кейс Kezi объясняется одним дефектом семантики: фильтр «Сегодня» в планировании строится через `listTodaysScheduledSuppliers`, которая отбирает активных поставщиков по **`deliveryWeekdays`** (дни доставки / «визиты»), а не по **`orderWeekdays`** (дни заказа). Данные берутся из одного каталога `platform_suppliers` → `normalizeSupplier`; в UI поставщиков поля разделены корректно («Дни заказа» / «Дни доставки»), но Planning их смешивает с логикой визитов Receiving. Таймзона и сдвиг Mon/Sun к этому кейсу не причастны.

---

## Доказательства

### Путь данных дней недели (один каталог)

| Этап | Где | Поле |
|------|-----|------|
| БД | `platform_suppliers.order_days`, `platform_suppliers.delivery_days` (`text`, JSON-массив id или legacy-строка) | два независимых столбца |
| Чтение cloud | `suppliersSupabaseAdapter.js` → `rowToSupplier` передаёт `order_days` / `delivery_days` | → `normalizeSupplier` |
| Чтение local | `suppliersLocalAdapter.js` | то же |
| Нормализация | `src/utils/supplierData.js` → `normalizeSupplier` | `orderWeekdays` / `deliveryWeekdays` (массивы `mon`…`sun`); display-строки `orderDays` / `deliveryDays` |
| Запись | `supplierToRow` / `supplierToOperationalRow` + local adapter | `serializeSupplierWeekdays(...)` обратно в `order_days` / `delivery_days` |
| UI каталога | `SupplierTable.jsx`: колонки «Дни заказа» / «Дни доставки» | `supplier.orderDays` / `supplier.deliveryDays` |
| UI формы | `SupplierForm.jsx`: лейблы «Дни заказа» / «Дни поставки» | `orderWeekdays` / `deliveryWeekdays` |
| Каталог в Planning | `getAllSuppliersSync()` → тот же `normalizeSupplier` | оба поля доступны на объекте |

UMAG-сид и create-путь синхронизации кладут пустые строки в оба поля; операционные дни заполняются вручную в платформе (не из UMAG API).

### Пикер в планировании (баг)

```
ProcurementPlannerView.jsx
  scheduledTodaysSuppliers = listTodaysScheduledSuppliers(getAllSuppliersSync())
  supplierSelectOptions = buildPlannerSupplierSelectOptions({
    scope: supplierScope,           // 'today' | 'all'
    scheduledSuppliers: scheduledTodaysSuppliers,
    catalogSuppliers: getAllSuppliersSync(),
    snapshotSuppliers: …
  })
  handleSupplierScopeChange → isSupplierInTodaySchedule(...)
```

| Функция | Файл | Какое поле weekday |
|---------|------|-------------------|
| `listTodaysScheduledSuppliers` | `src/utils/procurementPlannerUx.js` | **`deliveryWeekdays.includes(dayId)`** — единственный критерий «сегодня» |
| `getAppTimezoneWeekdayId` | там же | «сегодня» = weekday в `Asia/Almaty` (`sun`…`sat`) |
| `buildPlannerSupplierSelectOptions` | там же | при `scope === 'today'` **не** фильтрует по дням — берёт уже отфильтрованный `scheduledSuppliers` |
| `isSupplierInTodaySchedule` | там же | проверяет членство в `scheduledSuppliers` (+ legacy match по имени со snapshot) |

Комментарий у `listTodaysScheduledSuppliers` явно фиксирует замысел кода (не продукта владельца):

> Unique active suppliers scheduled for today (**deliveryWeekdays**). Same source semantics as «Визиты поставщиков».

UI Planning вторит той же семантике: empty-state «На сегодня **визитов** нет» (`ProcurementPlannerView.jsx`).

### Почему Kezi во четверг

При данных владельца:

- `orderWeekdays` ⊇ `wed`
- `deliveryWeekdays` ⊇ `thu`
- сегодня (Almaty) = `thu`

`listTodaysScheduledSuppliers` включает Kezi, потому что смотрит на доставку. Если бы фильтр шёл по `orderWeekdays`, в четверг Kezi не попал бы в «Сегодня».

Подтверждение по коду: **`orderWeekdays` нигде в приложении не используется для фильтрации** — только хранение, форма, таблица и сериализация. Все call site’ы weekday-фильтра опираются на `deliveryWeekdays`.

### Таймзона (не причина кейса)

- Planning: `getAppTimezoneWeekdayId(..., 'Asia/Almaty')` — корректный «сегодня» для Актобе/Алматы.
- Receiving / «Визиты»: `dateToSupplierWeekdayId(date)` = `date.getDay()` локали браузера.

Расхождение двух хелперов — отдельный риск для края суток / чужой TZ клиента, но **не объясняет** появление Kezi в четверг при заказе в среду и доставке в четверг.

---

## Таблица-инвентарь call site’ов фильтра по weekday

| # | Call site | Функция / место | Поле | Классификация |
|---|-----------|-----------------|------|---------------|
| 1 | `src/utils/procurementPlannerUx.js` | `listTodaysScheduledSuppliers` | `deliveryWeekdays` | **Planning — ошибочно день доставки** (должно быть день заказа) |
| 2 | `src/components/procurement/ProcurementPlannerView.jsx` | `useMemo` → `listTodaysScheduledSuppliers` | через #1 | Planning (потребитель бага) |
| 3 | `src/utils/procurementPlannerUx.js` | `buildPlannerSupplierSelectOptions` (`scope: 'today'`) | косвенно через `scheduledSuppliers` | Planning (не выбирает поле сам) |
| 4 | `src/utils/procurementPlannerUx.js` | `isSupplierInTodaySchedule` | членство в списке #1 | Planning (сброс выбора при переключении scope) |
| 5 | `src/utils/procurementWorkflow.js` | `buildExpectedDeliveryEntries` | `deliveryWeekdays` | **Receiving / ожидаемые визиты — корректно день доставки** |
| 6 | `src/utils/procurementWorkflow.js` | `buildMergedReceivingEntries` | через #5 | Receiving (чеклист недели) |
| 7 | `src/components/procurement/SimpleReceivingWeekView.jsx` | `buildMergedReceivingEntries` | через #5 | Receiving UI |
| 8 | `src/components/procurement/ProcurementPlanDayList.jsx` | `buildExpectedDeliveryEntries` | через #5 | **Другое / визиты в модуле закупа** — блок «Визиты поставщиков» (`PROCUREMENT_PLAN_LABEL`), день доставки уместен |
| 9 | `scripts/verify-procurement-desktop-ux.mjs` | тесты `listTodaysScheduledSuppliers` / options | фикстуры с `deliveryWeekdays` | Тест закрепляет текущую (ошибочную для Planning) семантику |

Не call site фильтра, но связаны:

| Место | Роль |
|-------|------|
| `SupplierForm.jsx` / `SupplierTable.jsx` | редактирование и показ обоих полей |
| `normalizeSupplier` / адаптеры | маппинг БД ↔ UI |
| `dateToSupplierWeekdayId` | weekday для визитов (#5), не для Planning Today |
| `getAppTimezoneWeekdayId` | weekday для Planning Today (#1) |

---

## Подтверждённое правило продукта: Planning vs Receiving

| Поверхность | Правильный смысл «сегодня / день недели» | Поле каталога |
|-------------|------------------------------------------|---------------|
| **Поставщики** | два независимых расписания | `order_days` / `delivery_days` |
| **Закупки → Планирование → «Сегодня»** | день, когда оформляем заказ | **`orderWeekdays`** |
| **Приёмка / ожидаемые визиты / «Визиты поставщиков»** | день, когда товар приезжает | **`deliveryWeekdays`** |

Сейчас Planning (#1–4) и Receiving/визиты (#5–8) используют **одно и то же** поле `deliveryWeekdays`. Для Receiving это совпадает с правилом; для Planning — нет.

---

## Рекомендуемое направление фикса (без реализации)

1. **Смена поля в Planning:** в `listTodaysScheduledSuppliers` фильтровать по `orderWeekdays` (тот же `dayId` / `Asia/Almaty`).
2. **Переименование / ясность API:** имя вроде `listTodaysOrderSuppliers`, комментарии и empty-state убрать «визиты» из Planning; Receiving оставить на `deliveryWeekdays` / `buildExpectedDeliveryEntries`.
3. **Общий хелпер (опционально):** например `listActiveSuppliersForWeekday(suppliers, weekdayId, { schedule: 'order' | 'delivery' })`, чтобы не повторить смешение; Planning и Receiving вызывают с разным `schedule`.
4. **Verify:** обновить `verify-procurement-desktop-ux` (и при необходимости отдельный `verify:*`) — фикстуры с разнесёнными order/delivery днями (кейс Kezi).
5. **Не трогать** в том же PR: RLS, Edge, UMAG-синк, Receiving, миграции схемы.

Политика при пустых `orderWeekdays`: решить с владельцем до кода (см. вопросы) — не смешивать молча с `deliveryWeekdays`.

---

## Вне скоупа / non-goals

- Исправление кода, коммиты, миграции, деплой.
- Баг `procurement_snapshots` / guard permission, UX кнопок заказа, ABC, repeat-analytics.
- Унификация `dateToSupplierWeekdayId` vs `getAppTimezoneWeekdayId` (отдельная тема, если всплывёт).
- Заполнение дней из UMAG (UMAG дней заказа/доставки не отдаёт).
- Переименование лейбла формы «Дни поставки» ↔ таблицы «Дни доставки».

---

## Вторичные риски

| Риск | Суть |
|------|------|
| Пустые дни заказа | После фикса по `orderWeekdays` поставщик с заполненной только доставкой пропадёт из «Сегодня», даже если раньше «случайно» попадал. Сид/UMAG-create дают `order_days: ''`. |
| UMAG-синк | `umag-sync` при **create** пишет пустые `order_days`/`delivery_days`; при **update** операционные дни **не затирает** (обновляет только UMAG-owned поля). Риск обнуления при обычном синке — низкий; при ручном merge/скриптах — смотреть отдельно. |
| Legacy match по имени | `normalizeSupplierMatchName` + `isSupplierInTodaySchedule` / snapshot enrichment могут удержать выбранного поставщика или склеить строки по имени, если id расходятся. Не причина появления Kezi в списке «Сегодня», но шум при смене scope. |
| Закрепление в тестах | Desktop-UX verify сейчас считает `deliveryWeekdays` правилом «сегодня» для Planning — регресс-тесты будут красными при правильном фиксе, пока не обновят фикстуры. |
| Два weekday-хелпера | Planning = Almaty; визиты = `Date#getDay()` браузера. Не Kezi, но потенциальный рассинхрон «сегодня» между экранами. |

---

## Вопросы владельцу для этапа 2 (макс. 5)

1. Если у поставщика **пустые дни заказа**, а дни доставки заполнены — скрывать из Planning «Сегодня», показывать в «Все», или нужен явный fallback/предупреждение?
2. Менять только логику фильтра или ещё копирайт («визитов» → «заказов» / переименование хелпера)?
3. Блок «Визиты поставщиков» (`ProcurementPlanDayList`) оставляем строго на днях доставки — подтвердите.
4. Нужен ли отдельный маленький PR только на Planning + verify, без трогания Receiving?
5. После фикса — нужна ли разовая сверка продовых карточек (кто завёл только доставку и пользовался «Сегодня» как списком визитов)?
