# Аудит — настройки столбцов таблицы Planning (resize / reorder / visibility)

**Направление:** только аудит + reference import (без правок planner-кода, без коммитов).  
**Дата:** 2026-08-22.  
**Экран:** Закупки → Планирование — `ProcurementPlannerView.jsx` / `.css`.  
**Reference UMAG:** `docs/procurement/reference-umag-table-columns-spec.md` (импорт из `umagtablecolumnsspec.md` владельца).

**Read-only verify (на момент аудита):**

| Script | Result |
|--------|--------|
| `npm run verify:procurement-planner-barcode-column` | **14/14** |
| `npm run verify:procurement-planner-tree` | **40/40** |
| `npm run verify:procurement-desktop-ux` | **182/182** |

---

## Вердикт

Фича **реализуема**, но это не «добавить шестерёнку» — сейчас **21 колонка захардкожена** в thead, `renderDesktopSkuRow` и частично в tree group row. UMAG-логику (`table-layout: fixed`, полный snapshot columns[], один save) можно перенести, но у Shugyla есть **дополнительная сложность**, которой нет у UMAG «Список товаров»:

1. **Четыре sticky-колонки** (№, Товар, Штрихкод слева + Заказ справа) с **жёстко прошитыми `left:`** (`2.75rem`, `13.75rem = 2.75+11`).
2. **Tree group row** — не full `colSpan`, а **3 leading cells + `colSpan={TABLE_COL_SPAN - 3}`**; число leading cells должно следовать за locked-left колонками.
3. **`abcSort`** — отдельная ось (server sort + отключение tree mode), **не** column order; смешивать с reorder опасно без явного разделения.
4. **Persist-слоя нет** — ни таблицы в Postgres, ни адаптеров; `pageSize` живёт только в React state (`DEFAULT_PAGE_SIZE = 25`).

Рекомендуемый v1 scope: **desktop Planning only**; mobile cards, другие таблицы платформы, PrimeNG, Edge — out.

---

## 1. Инвентарь колонок

`TABLE_COL_SPAN = 6 + PLANNER_WEEK_COLUMN_COUNT + 7` → **21** при 8 неделях.

Ширины по умолчанию — из `ProcurementPlannerView.css` (1rem ≈ 16px для px-оценки). Колонки без явного `width` в CSS получают долю оставшегося пространства через `table-layout: fixed`.

| Stable key | Label (RU) | Default width | Sticky | lockedVisible | togglable | Tree impact |
|------------|------------|---------------|--------|---------------|-----------|-------------|
| `rowNum` | № | 44px (`2.75rem`) | left `0` | **да** | **нет** | leading cell **пустая** (`aria-hidden`) |
| `product` | Товар | 176px (`11rem`) | left `2.75rem` | **да** | **нет** | **group label + toggle** |
| `barcode` | Штрихкод | 136px (`8.5rem`) | left `13.75rem` | **да** | **нет** | leading cell **пустая** |
| `abcQty` | К | 44px (`2.75rem` min) | — | нет | **да** | tail `colSpan` |
| `abcRevenue` | В | 44px | — | нет | **да** | tail |
| `abcProfit` | П | 44px | — | нет | **да** | tail |
| `week0` … `week7` | W1…W8 (из `buildPlannerWeekColumnLabels`) | ~42px (`2.6rem`) каждая | — | нет | **да** (8 чекбоксов) | tail |
| `stock` | Остаток | auto (~72px оценка) | — | нет | **да** | tail |
| `reserveDays` | Запас/дн | 52px min (`3.25rem`) | — | нет | **да** | tail |
| `avgDaily` | Спрос/дн | auto | — | нет | **да** | tail |
| `normDays` | Норма | auto | — | нет | **да** | tail |
| `recommendedQty` | Рек. | auto | — | нет | **да** | tail |
| `orderQty` | Заказ | 92px (`5.75rem`) | **right `0`** | **да** | **нет** | tail (но sticky справа — см. риски) |
| `supplier` | Поставщик | auto (~120px оценка) | — | нет | **да** | tail |

### Примечания к реестру

- **Stable keys** для недель: `week0`…`week7` (индекс в `item.weeklySales`), labels динамические из `snapshot.periodFrom/To` — в persist хранить key, не label.
- **ABC keys** совпадают с `ABC_AXES[].key` (`qty`, `revenue`, `profit`); server columns — `abc_qty`, `abc_revenue`, `abc_profit`.
- **`sort` в persist (UMAG-поле):** для Planning имеет смысл только на ABC-осях (`sort: true` в конфиге); текущее направление сортировки (`abcSort.dir`) — **отдельный ephemeral state**, не часть column settings (как в UMAG spec §6).
- **Классы CSS** сегодня привязаны к семантике (`proc-planner__col-product`, `proc-planner__sticky-barcode`), не к порядку — при dynamic render нужен mapping `key → className + renderCell`.

### Locked vs togglable (рекомендация аудита)

По аналогии с UMAG (fullName + barcode + control always visible) и текущим UX Planning:

| lockedVisible | togglable в панели |
|---------------|-------------------|
| `rowNum`, `product`, `barcode`, `orderQty` | все остальные 17 |

Итого **4 locked**, **17 togglable** (включая 8 недель по отдельности).

---

## 2. Текущий render path

### Константы и state

```105:106:src/components/procurement/ProcurementPlannerView.jsx
/** № + Товар + Штрихкод + К + В + П + 8 weeks + Остаток + Запас/дн + Спрос/дн + Норма + Рек. + Заказ + Поставщик */
const TABLE_COL_SPAN = 6 + PLANNER_WEEK_COLUMN_COUNT + 7
```

- `pageSize` — `useState(DEFAULT_PAGE_SIZE)` где `DEFAULT_PAGE_SIZE = 25`; меняется через pagination UI, **не persist**.
- `abcSort` — `useState({ field: '', dir: 'asc' })`; уходит в `fetchSnapshotItemsPage` как `sortField` / `sortDir`.
- `treeMode` — derived: `isPlannerTreeViewMode({ search, abcSortField })` → tree только когда **нет search и нет ABC sort**.

### `<thead>` (~2061–2123)

Жёсткий порядок в JSX:

1. №, Товар, Штрихкод (sticky)
2. `ABC_AXES.map` → К, В, П (кнопки sort + help на первой)
3. `weekColumns.labels.map` → 8 `<th className="proc-planner__col-week">`
4. Остаток, Запас/дн, Спрос/дн, Норма, Рек., Заказ (sticky right), Поставщик

Ширины на `<th>` **не** задаются inline — только CSS-классы. `table-layout: fixed` на `.proc-planner__table`.

### `renderDesktopSkuRow` (~1315–1379)

Один `<tr>` с **фиксированным порядком `<td>`**, зеркалящим thead:

- № → product block → barcode → 3× AbcBadge → 8× WeeklySalesCell → stock → reserve → avgDaily → norm → rec → order input → supplier
- Sticky classes на №, product, barcode, order
- **Единственная точка** для flat list и tree branch SKU (через `renderBranchSkuBlock`)

### `renderTreeGroupRow` (~1436–1488)

```1447:1486:src/components/procurement/ProcurementPlannerView.jsx
      <tr key={key} className={`proc-planner__tree-group depth-${depth}`}>
        <td className="proc-planner__col-num proc-planner__sticky-num" aria-hidden="true" />
        <td className="proc-planner__col-product proc-planner__sticky-product">…group inner…</td>
        <td className="proc-planner__col-barcode proc-planner__sticky-barcode" aria-hidden="true" />
        <td colSpan={TABLE_COL_SPAN - 3} className="proc-planner__tree-group-tail" />
```

- **`TABLE_COL_SPAN - 3`** = все колонки минус три locked-left (№, Товар, Штрихкод).
- При изменении набора locked-left колонок формула должна стать **`TABLE_COL_SPAN - lockedLeftCount`** (или dynamic tail span).

### Прочие строки с `colSpan`

| Строка | colSpan | Комментарий |
|--------|---------|-------------|
| flat loading / «Нет позиций» | `TABLE_COL_SPAN` | full width |
| tree root loading / «Нет категорий» | `TABLE_COL_SPAN` | full width |
| branch loading / empty / «Ещё · N» | `TABLE_COL_SPAN` | full width |

Служебные строки **не** должны участвовать в column reorder — всегда full span по **видимому** числу колонок (`visibleColumnCount`).

### Flat vs tree

| Режим | Условие | tbody |
|-------|---------|-------|
| **Tree** | `treeMode === true` | `renderTreeTableBody()` — category groups + lazy branch SKU |
| **Flat** | search или ABC sort или явный flat | `items.map(renderDesktopSkuRow)` + pagination |

Переключение tree ↔ flat сбрасывает branch state (`resetTreeState` on search/abcSort change).

### `abcSort` vs column order

**Разные оси:**

| | Column order (будущая фича) | abcSort (сейчас) |
|--|----------------------------|------------------|
| Что меняет | порядок `<th>`/`<td>` в DOM | порядок **строк** на сервере |
| Persist | `columnOrdinalNumber` в settings | **не persist** (session state) |
| Side effect | sticky left stack, tree colspan | **отключает tree** (`isPlannerTreeViewMode`) |
| UI | drag header | кнопки ↑↓ в ABC `<th>` |

При реализации: reorder ABC-колонок **допустим** (это presentation), но **не путать** с `abcSort.field` — sort остаётся привязан к `axis.column`, не к DOM-index.

---

## 3. UMAG → Shugyla mapping

### Уже есть (можно опереться)

| UMAG / reference | Shugyla Planning сейчас |
|------------------|-------------------------|
| `table-layout: fixed` | `.proc-planner__table { table-layout: fixed; min-width: 1600px; }` |
| Ширина на `<th>`, tbody следует | CSS width/min-width на `.proc-planner__col-*` |
| Горизонтальный scroll | `.proc-planner__table-wrap { overflow-x: auto }` |
| Много колонок + scroll | 21 col, sticky left/right |
| `pageSize` как часть table settings | `pageSize` state есть, но **не связан** с persist |
| Stable column keys (concept) | `ABC_AXES[].key`, week index — но **нет единого registry** |

### Строить с нуля

| Компонент | Описание |
|-----------|----------|
| **Column registry** | Массив defs: `{ key, label, lockedVisible, stickySide, defaultWidth, sortable, renderHeader, renderCell }` |
| **Dynamic thead/tbody** | Рендер visible columns в порядке `columnOrdinalNumber` |
| **Resize handle** | pointer drag на `<th>`, inline width, save on pointerup |
| **Reorder** | HTML5 DnD или pointer-drag на header body (не на resize zone) |
| **Visibility panel** | Gear popover, чекбоксы для togglable keys |
| **Persist service** | `tableSettingsLocalAdapter` + `tableSettingsSupabaseAdapter` + thin orchestrator |
| **DB migration** | `user_table_settings` + RLS |
| **Sticky stack calculator** | `left` для каждой sticky-left = sum(widths of visible locked-left predecessors) |
| **Tree colspan helper** | `tailSpan = visibleColumnCount - visibleLockedLeftCount` |
| **Merge saved + defaults** | Unknown keys in DB → ignore; new keys in code → append with defaults |

### Shugyla-специфика (нет в UMAG reference)

- **Sticky right «Заказ»** с accent background — при hide/order нужны правила.
- **Tree group row** с partial leading cells.
- **ABC sort** + tree mode gating.
- **Week labels** зависят от snapshot period (labels не persist, keys persist).

---

## 4. Persist design (proposal)

### Идентификатор таблицы

```text
table_name = 'PROCUREMENT_PLANNER'
```

Один row на `(auth_user_id, table_name)` — v1 **per-user** (рекомендация; см. вопросы владельцу). Поле `store_id` можно зарезервировать nullable для будущего multi-store, но Shugyla сейчас один магазин.

### JSON payload (одна строка / один upsert)

```json
{
  "table_name": "PROCUREMENT_PLANNER",
  "page_size": 25,
  "columns": [
    {
      "column_name": "product",
      "column_ordinal_number": 1,
      "visible": true,
      "width": 176,
      "sort": false
    }
  ]
}
```

Соглашения:

- **Полный snapshot** на каждый save (resize-end, reorder-drop, visibility toggle, pageSize change) — как UMAG §4–6.
- Имена полей: snake_case в Postgres JSONB **или** camelCase в JS + map в adapter — выбрать один стиль при реализации (в коде проекта чаще camelCase в JS, snake в SQL).
- `sort: true` только для ABC axes в static registry; значение не отражает текущий `abcSort.dir`.

### Postgres (sketch)

```sql
create table public.user_table_settings (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  table_name text not null,
  page_size integer not null default 25,
  columns jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (auth_user_id, table_name)
);
-- RLS: select/insert/update where auth_user_id = auth.uid()
```

### Adapters

| Adapter | Storage | Когда |
|---------|---------|-------|
| `tableSettingsLocalAdapter.js` | `localStorage` key `shugyla:tableSettings:PROCUREMENT_PLANNER` | `!isCloudMode()` |
| `tableSettingsSupabaseAdapter.js` | `user_table_settings` upsert/select | cloud |
| Orchestrator | `tableSettingsService.js` или метод в `platformDataService` | выбор по `isCloudMode()` |

Паттерн — как `rbacService.js` / `notification_preferences` RLS.

### Edge Function нужен?

**Нет для v1.** CRUD per-user settings без секретов — стандартный Supabase client + RLS достаточно (аналог `notification_preferences`). Edge имеет смысл только если позже понадобится admin-reset или org-wide defaults с серверной валидацией.

### Load / apply flow

1. Mount `ProcurementPlannerView` → fetch settings (parallel with snapshot ok).
2. `mergePlannerColumnSettings(defaultRegistry, saved.columns)` → ordered visible defs.
3. Apply widths as inline `style={{ width: n }}` on `<th>` (UMAG pattern).
4. On pageSize change from pagination → include in same save object.
5. Fallback: если нет записи — defaults из registry (текущий hardcoded layout).

---

## 5. Риски

| Риск | Severity | Детали / митигация |
|------|----------|-------------------|
| **Sticky left stack после reorder/resize** | **Высокий** | Сейчас `left: 13.75rem = 2.75+11` hardcoded. При reorder barcode перед product или resize product width stack ломается. Нужен runtime `computeStickyLeft(key, visibleColumns)`. |
| **Resize + `min-width: 1600px`** | Средний | UMAG expand-mode увеличивает таблицу, не сжимает соседа — совместимо. Sum(widths) может уйти **выше** 1600px → OK при scroll. Не уменьшать min-width при shrink hidden cols без пересчёта. |
| **Скрытие sticky «Заказ»** | **Высокий** | `orderQty` lockedVisible → user **не может** скрыть в v1. Если владелец разрешит hide — sticky-right и Enter-navigation по qty ломаются. |
| **Tree group leading cells** | **Высокий** | Leading count = visible locked-left columns in **current order**. Product column must remain the cell with toggle. Refactor `renderTreeGroupRow` to iterate locked-left defs, not 3 magic `<td>`. |
| **colSpan drift** | Средний | `TABLE_COL_SPAN` static 21 → заменить на `visibleColumns.length` для service rows; tail = `visibleColumns.length - lockedLeftVisible.length`. |
| **abcSort + hidden ABC col** | Средний | Sort button скрыт → user может иметь active `abcSort.field` on hidden column; сброс sort при hide или keep sort without header. |
| **Persist migration / merge** | Средний | Новая колонка в коде (post-deploy) → merge into saved settings; removed key → drop. |
| **Verify brittleness** | Средний | Много regex на hardcoded thead order (barcode-column, tree, weeks) — обновить или перейти на registry-based asserts. |
| **Mobile v1 out of scope** | Низкий | Mobile cards не используют table settings; desktop-only gear — OK. |

---

## 6. Verify — impact + новый outline

### Существующие scripts (затронуть при реализации)

| Script | Почему |
|--------|--------|
| `verify-procurement-planner-barcode-column.mjs` | hardcoded thead order, sticky `13.75rem`, `TABLE_COL_SPAN - 3` |
| `verify-procurement-planner-tree.mjs` | tree colspan, `table-layout: fixed`, sticky bounds |
| `verify-procurement-planner-weeks.mjs` | 8 week headers, span formula |
| `verify-procurement-abc-analysis.mjs` | ABC columns in table |
| `verify-procurement-planner-reserve-days.mjs` | column set / span |
| `verify-procurement-planner-header.mjs` | toolbar coexistence with settings gear |
| `verify-procurement-desktop-ux.mjs` | likely minimal; Enter/qty paths must survive |

### Новый script (outline)

`scripts/verify-procurement-planner-column-settings.mjs` + `package.json` entry:

1. **Registry module exists** — e.g. `procurementPlannerColumns.js` with 21 keys including `week0`…`week7`.
2. **`PROCUREMENT_PLANNER` constant** in adapter/service.
3. **Default registry** — locked: `rowNum`, `product`, `barcode`, `orderQty`.
4. **Persist shape** — `page_size` + `columns[]` with `column_name`, `column_ordinal_number`, `visible`, `width`.
5. **Local adapter** — read/write localStorage key pattern.
6. **Supabase adapter** — references `user_table_settings` table name (static string in migration + adapter).
7. **Planner integration hooks** — e.g. `usePlannerTableColumns` or `mergePlannerColumnSettings` imported in view.
8. **Dynamic render** — thead built from registry loop (regex: no 21 sequential literal `<th>Товар</th>`-only path **or** assert `renderPlannerHeader(columns)` helper).
9. **Tree tail helper** — function `plannerTreeTailColSpan(columns)` replaces magic `- 3` or wraps it.
10. **Sticky calculator** — pure function test: reorder widths → updated `left` values.
11. **No Edge function** for table settings (negative assert optional).
12. **Mobile** — assert settings gear only in `.proc-planner__desktop` block (optional v1).

Preflight после реализации:

```bash
npm run verify:procurement-planner-column-settings   # new
npm run verify:procurement-planner-barcode-column
npm run verify:procurement-planner-tree
npm run verify:procurement-planner-weeks
npm run verify:procurement-abc-analysis
npm run verify:procurement-desktop-ux
```

---

## 7. Черновик этапов T1–T4 + non-goals

### T1 — Registry + persist foundation

- `procurementPlannerColumnRegistry.js` — 21 defs, defaults, locked/toggable flags.
- Migration `user_table_settings` + RLS.
- `tableSettingsLocalAdapter` / `tableSettingsSupabaseAdapter` / service.
- `mergePlannerColumnSettings(saved, defaults)` pure function + unit asserts in verify.
- **Без UI изменений** в planner (или только load settings to console/dev flag).

**Приёмка:** verify registry + adapters static; migration applies locally.

### T2 — Dynamic column render (read-only layout)

- Refactor thead + `renderDesktopSkuRow` to render from merged column list.
- Replace magic `TABLE_COL_SPAN` with `visibleColumns.length`.
- Tree group: dynamic leading cells + tail span helper.
- Sticky `left` from calculator (defaults only, no user resize yet).
- **Поведение идентично текущему** при default settings.

**Приёмка:** все existing planner verify green; pixel parity smoke.

### T3 — Interactive settings UI

- Resize handles on `<th>` (pointer, save on up).
- Reorder (HTML5 DnD desktop).
- Gear panel — visibility toggles.
- Wire save on each action + pageSize change persist.
- Load settings on mount.

**Приёмка:** reload page restores layout; cloud + local modes.

### T4 — Hardening + docs

- Edge cases: abcSort vs hidden ABC, tree + custom layout smoke.
- `verify-procurement-planner-column-settings.mjs` full.
- `docs/procurement/plan-planner-table-column-settings.md` (plan doc for owner).
- Manual checklist: reorder sticky stack, widen product, hide «Поставщик», tree expand.

### Non-goals (v1)

- Mobile card column settings.
- Другие таблицы (`Orders`, `Receiving`, `Employees`, UMAG settlements).
- PrimeNG / новые npm UI deps.
- Edge Function для settings.
- Org-wide / per-store shared layouts (until owner decides).
- «Сброс к defaults» кнопка (UMAG тоже без неё; optional later).
- Column chooser for export (`procurementPlanExport.js` stays 5 cols).
- Virtual scroll / horizontal virtualisation.

---

## 8. Вопросы владельцу (блокеры дизайна)

1. **Persist scope:** настройки **per-user** (рекомендация аудита) или **общие на магазин** для всех ~13–15 сотрудников?
2. **Locked columns:** подтверждаем **№ + Товар + Штрихкод + Заказ** always visible (как UMAG fullName/barcode/control)?
3. **Недели в toggler:** **8 отдельных чекбоксов** (W1…W8) или одна группа «Продажи по неделям» (скрыть/показать все 8)?
4. **Сброс defaults:** нужна ли кнопка «Вернуть по умолчанию» в v1, или достаточно ручного восстановления как в UMAG?

---

## Findings (3)

1. **Planner уже на UMAG-совместимом фундаменте** (`table-layout: fixed`, width on cols, horizontal scroll, 1600px floor), но **весь render path императивный** — 21 колонка продублирована в thead и `renderDesktopSkuRow`; без registry refactor любой reorder сломает tree colspan и verify-regex.

2. **Sticky left `13.75rem` — функциональная бомба для column settings** — значение выведено из текущих default widths, не из runtime column state; resize/reorder без `computeStickyLeft` даст наложение №/Товар/Штрихкод.

3. **Persist-слоя в репозитории нет** (`user_table_settings` / adapters — 0 matches); `pageSize` уже есть в UI но живёт отдельно — UMAG-модель требует **объединить** в одну сущность до UI шестерёнки, иначе два источника правды.

---

## Вопросы владельцу (кратко, до 4)

См. §8 — ключевые: **per-user vs shared**, **locked four**, **8 week toggles vs group**, **reset button v1 yes/no**.
