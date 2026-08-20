# План: supplier-scoped дерево + снос filter popover → ABC 3 колонки

**Статус:** PR1 + PR2 реализованы (verify — прогнать; коммит/PR — по команде владельца).  
**Дата:** 2026-08-21.  
**Опора:** `docs/procurement/audit-planner-abc-columns-supplier-tree.md`  
**Формат:** два узких PR — **PR1** supplier tree + chip + снос advanced filter → **PR2** ABC 3 колонки + sort arrows. Без page-cache, без P3, без новых UI-lib.

Решения владельца:

| # | Тема | Решение |
|---|------|---------|
| 1 | Порядок | (1) supplier-scoped tree + chip «к заказу» → (2) ABC 3 колонки |
| 2 | Без поставщика | Дерево **всего снимка** (как сейчас) |
| 3 | Chip N | Без поставщика = `snapshot.orderableCount`; с поставщиком = `filterOptions.suppliers[].orderablePositions` |
| 4 | Пустые cat | При активном поставщике **скрывать** count 0 |
| 5 | Counts | Честные keyed maps; в строке группы — `{N} поз · {M} к заказу`; scope только в tooltip |
| 6 | ABC | Три колонки К/В/П + постоянные ↑↓; серверный sort уже есть; «?» компактно |
| 7 | Advanced filter | **Убрать** кнопку/popover целиком; инвентарь → удалить / chip / выкинуть (см. §PR1) |
| 8 | ABC class filter | Из popover **не переносить** — достаточно sort по колонкам (PR2); state `abcQty/Revenue/Profit` можно обнулить/вычистить |
| 9 | Стек | Без page-cache / P3 / новых UI-lib |

Противоречий аудиту нет: владелец утвердил рекомендуемый порядок PR и S1; дополнительно приказал снести advanced filter popover.

---

## Цель и non-goals

### Цель

1. Когда выбран поставщик — дерево категорий/sub и counts показывают **только его** SKU; chip «Только к заказу N» отражает N этого поставщика; пустые группы скрыты.  
2. Убрать дублирующий advanced filter popover (category/sub / orderable / ABC class / …).  
3. Сделать ABC читаемым: три отдельные колонки с явным sort-affordance.

### Non-goals

- Page-cache соседних веток / P3 server mixed-stream tree  
- SQL RPC / новая схема только ради aggregates (S3 аудита)  
- Загрузка ~10k SKU в React state ради counts  
- Filter-воронка UMAG в th ABC  
- Перенос ABC class A/B/C filter в toolbar  
- Sense-line / browse / dual-mode (уже сняты)  
- Новые UI-библиотеки / Tailwind

### Принципы

1. Один PR = одно направление (корректность scope → читаемость ABC).  
2. Leaf `fetchSnapshotItemsPage` с `platformSupplierId` уже корректен — не ломать.  
3. Counts только из scan aggregates, не из `items.length` текущей page.  
4. После сноса popover единственные фильтры scope: поставщик, chip orderable, search, alert chips, (опц.) warnings chip.

---

## PR1 — Supplier-scoped tree + chip + снос filter popover

**Статус этапа:** реализация сделана, готово к ревью.  
**Verify:** `npm run verify:procurement-planner-tree` (+ header / weeks / pagination / desktop / abc-analysis).  
**Group UX:** имя + приглушённое `{N} поз · {M} к заказу` (M из orderable keyed maps); scope в `title`.  
**Пагинация ветки:** без изменений (кнопка «Ещё»).

**Ветка (рекомендация):** `cursor/planner-supplier-tree-scope`  
**База:** текущий Planning с in-table tree (PR B).

### 1. Counts S1 (keyed maps)

Расширить `createSnapshotFilterAccumulator` / `accumulateSnapshotFilterRow` / `finalizeSnapshotFilterOptions`:

| Данные | Без поставщика | С `platformSupplierId` |
|--------|----------------|------------------------|
| `categoryCounts` / `pairCounts` | snapshot-wide (как сейчас) | не использовать для nav |
| Новое: `categoryCountsBySupplier[supplierId][cat]` | — | срез для nav |
| Новое: `pairCountsBySupplier[supplierId][cat\0sub]` | — | срез для nav |
| `suppliers[].orderablePositions` | без изменений | chip N |

Тот же full-scan (`scanSnapshotFilterOptions`) — без второго 10k client load.  
Cache: bump `filterOptions.v2` → **`v3`** (`procurementFilterOptionsCache.js`).

`buildPlannerCategoryNavModel(filterOptions, { platformSupplierId })`:

- нет supplier → глобальные counts + подпись **«по снимку»**;  
- есть supplier → срез keyed maps + подпись **«у поставщика»**; **drop entries с count 0**;  
- список категорий для nav строить из ключей среза, не из глобального `categories[]` без фильтра.

`orderableOnly`: leaf уже фильтрует. Для MVP counts дерева при включённом chip — **тот же predicate**, что и leaf (если orderableOnly — считать в keyed maps только qty>0 **или** отдельные `*Orderable` maps). Зафиксировать в реализации один вариант и отразить в verify; предпочтение: при `orderableOnly` nav считает только orderable SKU в активном supplier-scope (и глобально, если поставщик не выбран).

`applyItemDeltaToFilterOptions`: обновить supplier-keyed counts при смене qty/supplier на строке **или** инвалидировать cache + soft revalidate (предпочтение: корректный delta, чтобы chip/workflow не расходились). Минимум — не оставлять stale counts после blur-save без пути обновления.

Убрать ложный `plannerCategoryCountsNeedScopeNote` дисклеймер «без учёта поставщика» после того, как counts честные.

### 2. Chip «Только к заказу N»

```text
N = filters.platformSupplierId
  ? (selectedSupplierSummary?.orderablePositions ?? 0)
  : (snapshot?.orderableCount ?? 0)
```

Хелпер (опц.): `getOrderableChipCount({ supplierId, summary, snapshotOrderableCount })` в `procurementPlannerUx.js`.  
Toggle `orderableOnly` поведение не менять — только источник N.

### 3. Инвентарь advanced filter popover → миграция

Текущий UI: `PlatformFilterButton` + `.proc-planner__filter-pop`.

| Поле popover | Решение PR1 | Куда |
|--------------|-------------|------|
| Категория / Подкатегория | **Удалить** | Дублируют дерево; `filters.categoryName/subcategoryName` сбросить в `''` и убрать из UI (state можно оставить пустым для leaf API совместимости или вычистить из scope key, если больше не выставляются) |
| Только к заказу | **Удалить из popover** | Уже toolbar chip `.proc-planner__orderable-toggle` |
| Только без поставщика | **Перенести** | Поведение как сейчас у alert chip «Без поставщика» (`unassignedOnly` + `orderableOnly` + clear supplier). Если alert chip уже есть при count>0 — достаточно его; иначе добавить постоянный/условный toolbar chip с тем же handler |
| Только предупреждения (`warningsOnly`) | **Перенести** | Компактный toolbar chip/toggle «Предупреждения» (negative stock); иначе потеряем фильтр |
| ABC class A/B/C (3 fieldset) | **Выкинуть** | Не переносить; sort по колонкам в PR2; обнулить `abcQty/Revenue/Profit` и убрать UI; service `.in()` для ABC class можно оставить мёртвым API до отдельной чистки |
| «Сбросить» popover | **Удалить** вместе с popover | Сброс отдельных chips — снятие chip / clear supplier |
| Кнопка фильтра + `filterOpen` / `activeFilterCount` | **Удалить** | Нет popover — нет badge count |

**Явно зафиксировано:** ABC class filter из popover **не** обязателен и **не** входит в toolbar MVP.

Сохранить:

- Alert chips в UMAG strip (`getPlannerAlertChips`: unassigned / inconsistent) — клики уже ставят фильтры.  
- Chip orderable, supplier select, search.

После сноса: регрессы verify, которые ищут `proc-planner__filter-pop`, reset ABC groups в popover, `PlatformFilterButton` в planner — обновить.

### 4. Файлы PR1 (ожидаемые)

| Файл | Что |
|------|-----|
| `src/utils/procurementPlannerUx.js` | keyed counts; nav model + scope label; chip count helper; delta maps |
| `src/services/procurementFilterOptionsCache.js` | v3 key; clone новых полей |
| `src/services/procurementPlanningService.js` | scan select без изменений колонок (уже есть supplier id); finalize через ux |
| `src/components/procurement/ProcurementPlannerView.jsx` | nav scope; chip N; снос filter button/popover; warnings (+ unassigned если нужно) chip |
| `src/components/procurement/ProcurementPlannerView.css` | убрать/не использовать filter-pop; стили новых chips |
| `scripts/verify-procurement-planner-tree.mjs` | supplier slice, hide zero, chip N source, нет filter-pop |
| `scripts/verify-procurement-planner-header.mjs` | orderable chip + N logic; нет browse (уже) |
| `scripts/verify-procurement-pagination-ux.mjs` / desktop / abc-analysis / repeat-orders-ui | поправить asserts на popover/reset, если красные |
| `docs/procurement/plan-planner-abc-columns-supplier-tree.md` | статус PR1 |

### 5. Verify + приёмка PR1

```bash
npm run verify:procurement-planner-tree
npm run verify:procurement-planner-header
npm run verify:procurement-pagination-ux
npm run verify:procurement-desktop-ux
# + любые verify, упавшие из‑за сноса popover / ABC filter UI
```

**Ручные:**

1. Без поставщика — дерево как весь снимок; chip N = orderable снимка.  
2. Выбрать поставщика с черновиком — дерево только его cat/sub; counts «у поставщика»; пустых нет; expand → SKU этого поставщика.  
3. Chip N = workflow orderable (согласовано с «Черновик · N позиций»).  
4. Нет кнопки «фильтр» / popover.  
5. «Только к заказу» chip работает; «Без поставщика» / «Предупреждения» доступны с toolbar/strip.  
6. Search / ABC sort (ещё старый head) — flat + supplier filter сохраняется.

---

## PR2 — ABC три колонки + sort arrows

**Статус этапа:** реализация сделана, готово к ревью.  
**Verify:** `npm run verify:procurement-abc-analysis`, weeks, tree, header (+ pagination/desktop регресс).  
**Ветка (рекомендация):** `cursor/planner-abc-columns`  
**База:** PR1 в `main` (или поверх PR1).

### UX

| Элемент | Деталь |
|---------|--------|
| Thead | Три `th`: **К**, **В**, **П** (короткие), каждая кликает `nextAbcSortState` |
| Affordance | Постоянные ↑ и ↓ (muted / active direction), не только стрелка после клика |
| Help | Компактный «?» у группы ABC (первый th или узкий label) — тот же текст `ABC_COLUMN_HELP` |
| Body desktop | Три `td` с одной буквой (вместо одного `AbcBadges` wrap) |
| Mobile | Можно оставить `AbcBadges` на карточке |
| Flat fallback | Без изменения: любой `abcSort.field` → плоский список |
| Class filter | Не возвращать |

### Colspan / layout

- Сейчас: `TABLE_COL_SPAN = 3 + PLANNER_WEEK_COLUMN_COUNT + 6` (= 17).  
- После: **`5 + PLANNER_WEEK_COLUMN_COUNT + 6`** (= 19) — № + Товар + К + В + П.  
- Обновить asserts в `verify-procurement-planner-weeks.mjs`, `verify-procurement-abc-analysis.mjs`, tree (colSpan group rows).  
- CSS: узкие колонки по духу weeks; `min-width` таблицы +чуть.

### Файлы PR2 (ожидаемые)

| Файл | Что |
|------|-----|
| `ProcurementPlannerView.jsx` | 3 th/td; colspan; «?»; убрать compact КВП-в-одной-ячейке |
| `ProcurementPlannerView.css` | col-abc-axis, sort chevrons, active |
| `procurementAbc.js` | опц. short labels; aria уже есть |
| `verify-procurement-abc-analysis.mjs` | 3 колонки вместо «one ABC column + badges» |
| `verify-procurement-planner-weeks.mjs` | формула TABLE_COL_SPAN |
| `verify-procurement-planner-tree.mjs` / header | регресс |
| этот plan-док | статус PR2 |

### Verify + приёмка PR2

```bash
npm run verify:procurement-abc-analysis
npm run verify:procurement-planner-weeks
npm run verify:procurement-planner-tree
npm run verify:procurement-planner-header
```

**Ручные:**

1. Три колонки К/В/П; клик циклит sort; стрелки всегда видны, активная ярче.  
2. «?» показывает пороги A/B/C без легенды на экране.  
3. Sort → flat list; сброс sort → дерево.  
4. Sticky Товар/Заказ и weeks без поломок; таблица не «прыгает» сверх ожидаемого +2 col.

---

## Порядок выкладки

```text
PR1 (supplier tree + chip + снос filter popover)
  → verify зелёный → ревью → merge по команде
    → PR2 (ABC 3 колонки + arrows)
      → verify зелёный → ревью → merge
```

- Коммит / push / PR — только по явной команде владельца на каждый этап.  
- Не смешивать PR1 и PR2.  
- Не начинать page-cache / P3.

Ориентир сообщений:

```text
fix(procurement): scope planner tree and orderable chip to supplier
feat(procurement): split ABC into sortable K/V/P columns
```

---

## Закрытые решения владельца (кратко)

1. Порядок: **PR1 supplier → PR2 ABC**.  
2. Без поставщика — дерево всего снимка.  
3. Chip N: snapshot vs `orderablePositions`.  
4. Пустые категории при поставщике — скрыть.  
5. Counts S1 keyed maps; подпись «у поставщика» / «по снимку» честно.  
6. ABC: 3 колонки + постоянные стрелки + «?»; class filter не нужен.  
7. Advanced filter popover — снести; category/sub удалить; orderable уже chip; warnings (+ unassigned) → toolbar/strip chips; ABC class — выкинуть.  
8. Без page-cache / P3 / новых UI-lib.

---

## Preflight исполнителя

1. Прочитать этот план + аудит.  
2. Дифф только по файлам этапа.  
3. Прогнать verify этапа + регресс.  
4. Не коммитить, пока владелец не попросит.
