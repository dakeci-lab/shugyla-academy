# Аудит — ABC как отдельные колонки + дерево/chip по поставщику

**Направление:** только аудит (без правок кода, без коммитов).  
**Дата:** 2026-08-21.  
**Кейс:** после in-table tree (PR B) владелец видит две связанные UX-дыры в Planning:

1. **ABC** — К/В/П скучены под одним `th`, сортировка неочевидна; цель — три отдельные колонки со sort-affordance (как недели / UMAG «Закуп. цена»).  
2. **Поставщик** — выбран «Диззи», workflow «Черновик · 14 позиций», но дерево и chip «Только к заказу 2930» остаются **глобальными по снимку**, а не по поставщику.

**Опора:** `docs/procurement/plan-planner-tree-compact-ux.md` (PR B), `src/utils/procurementPlannerUx.js` (accumulator / nav model), `src/services/procurementPlanningService.js` (`fetchSnapshotItemsPage` / `scanSnapshotFilterOptions`), `ProcurementPlannerView.jsx`.

**Вне скоупа:** page-cache страниц SKU, P3 server mixed-stream tree, Edge/SQL schema redesign, удаление колонки Заказ/Поставщик, sense-line / browse.

---

## Вердикт

Обе проблемы **реальные и фронтово объяснимые**; leaf-SKU уже умеет фильтр по поставщику, ломается **корень дерева и chip**.

- **ABC** — локальный UI/CSS + `TABLE_COL_SPAN` / verify; серверный sort (`abc_qty` / `abc_revenue` / `abc_profit`) уже есть.  
- **Supplier tree** — корневая причина: `categoryCounts` / `pairCounts` и список категорий в `filterOptions` считаются **снимком целиком** в одном scan; UI дерева читает только их. `platformSupplierId` уходит в `fetchSnapshotItemsPage` (flat + expand ветки), но **не** в `buildPlannerCategoryNavModel`. Chip «Только к заказу» берёт `snapshot.orderableCount`, игнорируя `selectedSupplier.orderablePositions` (уже есть в том же `filterOptions.suppliers[]`).  
- Пересчёт counts **без** выгрузки ~10k SKU в UI-state возможен: расширить **уже существующий** full-scan accumulator keyed by supplier (или узкий повторный scan с `.eq(platform_supplier_id)` при выборе поставщика). Client-side «отрезать» текущие `categoryCounts` нельзя — в них нет разреза по поставщику.

Рекомендуемый порядок: **сначала supplier-tree + chip (корректность)**, затем **ABC-колонки (читаемость)** — два узких PR.

---

## A) ABC UX

### Сейчас

| Элемент | Где | Поведение |
|---------|-----|-----------|
| Один `th` | `.proc-planner__col-abc` | Заголовок «ABC» + «?» (`AbcColumnHelp`) + три кнопки К/В/П внутри ячейки |
| Сортировка | `abcSort` + `nextAbcSortState` / `abcSortAriaLabel` | Cycle idle → asc → desc → idle; активная кнопка `is-active` + стрелка только когда поле активно |
| Ячейка строки | `<AbcBadges />` → три `.proc-planner__abc-badge` | Компактные буквы A/B/C/— в **одной** `td` |
| Фильтр класса | advanced popover `filters.abcQty/Revenue/Profit` | Отдельно от sort; `toggleAbcClassFilter` |
| Flat fallback | `isPlannerTreeViewMode` | Любой `abcSort.field` → плоский список + global pagination |
| Colspan | `TABLE_COL_SPAN = 3 + PLANNER_WEEK_COLUMN_COUNT + 6` (= 17) | «3» = № + Товар + **одна** ABC |

Сортировка **работает**, но affordance слабый: мини-кнопки внутри заголовка, стрелка появляется только после клика, визуально не «колонка как недели».

### Целевое (по запросу владельца)

| Элемент | Цель |
|---------|------|
| Thead | Три `th`: **К**, **В**, **П** (короткие), каждая — кликабельная сортировка |
| Affordance | Постоянные ↑/↓ (или пара шевронов) + активное состояние направления; референс UMAG «Закуп. цена». Filter-воронка **не** обязательна, если только sort |
| Help | «?» сохранить у группы (над/рядом с первым ABC th, или отдельный узкий `th`/label «ABC» без данных) — без длинной легенды на экране |
| Body | Три `td` с одной буквой каждая (вместо одного `AbcBadges` wrap) — desktop; mobile может оставить badges |
| Поведение sort | Тот же `nextAbcSortState` / серверный `sortField`; flat fallback без изменения контракта |

### Файлы (ожидаемо при реализации)

| Файл | Что |
|------|-----|
| `ProcurementPlannerView.jsx` | thead 3× th; tbody 3× td; `TABLE_COL_SPAN` → `5 + weeks + 6` (= 19) или явная константа; mobile — по желанию |
| `ProcurementPlannerView.css` | узкие col как weeks; sort chevrons; убрать/сузить compact head КВП-в-одной-ячейке |
| `procurementAbc.js` | скорее без логики; возможно хелпер short label К/В/П |
| `verify-procurement-abc-analysis.mjs` | «desktop has ABC column» / badges → 3 колонки; colspan формула |
| `verify-procurement-planner-weeks.mjs` | assert `TABLE_COL_SPAN = 3 + …` → обновить |
| `verify-procurement-planner-tree.mjs` / header | регресс sticky/orderable; ABC help «?» |

### Влияние на соседнее

| Тема | Влияние |
|------|---------|
| Tree group `colSpan` | Автоматически через `TABLE_COL_SPAN` |
| Sticky №/Товар/Заказ | ABC остаётся в «средней» зоне со weeks — sticky не трогать |
| Flat / search | Без изменений контракта |
| Keep-previous | `buildPlannerItemsScopeKey` уже включает `abcSort` |
| `min-width` таблицы | Чуть шире (+2 узких col) — подкрутить CSS |

---

## B) Supplier tree / chip

### Симптом (кейс «Диззи»)

| Поверхность | Факт | Ожидание владельца |
|-------------|------|-------------------|
| Workflow | «Черновик · 14 позиций · …» из `getSupplierWorkflowStatus` ← `orderablePositions` / draft helpers **выбранного** supplier summary | Ок — уже per-supplier |
| Дерево категорий | Все категории + counts «по снимку» (Бакалея 1314…) | Только категории/sub/SKU этого поставщика + counts по нему |
| Chip «Только к заказу N» | `N = snapshot.orderableCount` (глобально, ~2930) | С поставщиком: N = его orderable; без — snapshot |
| Expand «+» → SKU | `loadBranchSkuPage` / flat `loadItems` **уже** передают `...filters` → `platformSupplierId` в `fetchSnapshotItemsPage` | SKU-лист сужается; **корень врёт** относительно листьев |

Известный MVP-флажок PR B: `plannerCategoryCountsNeedScopeNote` при выбранном поставщике меняет `title` на «по снимку (без учёта поставщика / „к заказу“)» — то есть ограничение **осознанное**, но UX для закупщика неприемлем.

### Поток данных

```text
scanSnapshotFilterOptions (все строки снимка, page 1000)
  → accumulateSnapshotFilterRow
       categoryCounts[cat] += 1          // ВСЕГДА глобально
       pairCounts[cat\0sub] += 1         // ВСЕГДА глобально
       suppliers[id].orderablePositions  // только qty>0, per supplier ✓
  → finalizeSnapshotFilterOptions → filterOptions (+ cache v2)

buildPlannerCategoryNavModel(filterOptions)
  → categoryNavModel  // игнорирует filters.platformSupplierId

chip «Только к заказу»
  → snapshot.orderableCount              // мета снимка, не supplier

fetchSnapshotItemsPage({ platformSupplierId, categoryName, … })
  → leaf / flat  // фильтр поставщика ✓
```

### Корневая причина

1. **Корень дерева** строится из snapshot-wide counts, не из supplier-scoped aggregates.  
2. **Chip** читает поле снимка, хотя per-supplier `orderablePositions` уже в `filterOptions.suppliers`.  
3. Client не может «вычесть» поставщика из текущих `categoryCounts` — разреза нет.

### Уже есть per-supplier

| Поле | Где | Смысл |
|------|-----|--------|
| `suppliers[].orderablePositions` | filter scan | SKU с `final_order_qty > 0` у поставщика |
| `totalQty`, `pendingPositions`, `pendingQty`, `generated*` | то же | workflow / export guards |
| `unassignedOrderableCount` | scan | chip «Без поставщика» |
| `snapshot.orderableCount` | meta снимка | **глобальный** orderable |

**Нет:** `categoryCounts` / `pairCounts` / `categories` list, разрезанные по `platform_supplier_id` (и по `orderableOnly`).

### Варианты пересчёта counts (без 10k в React state / без P3 tree)

| # | Вариант | Плюсы | Минусы |
|---|---------|-------|--------|
| **S1** | Расширить accumulator в том же full-scan: `categoryCountsBySupplier[supplierId][cat]`, `pairCountsBySupplier…`; nav model выбирает срез по `filters.platformSupplierId`. Cache → **v3** | Один scan как сейчас; переключение поставщика мгновенно; честные counts | Больше JSON в localStorage; delta `applyItemDeltaToFilterOptions` надо научить трогать supplier-keyed maps (или инвалидировать scan при qty-save — уже есть path) |
| **S2** | При выборе поставщика — **узкий** повторный scan/select только `.eq(platform_supplier_id, id)` (+ опционально orderable) → ephemeral `scopedFilterOptions` для дерева | Не раздувает глобальный cache; проще delta | Лишняя сеть на каждый supplier switch; два источника правды |
| **S3** | SQL `GROUP BY platform_supplier_id, category_name` (RPC/view) | Точные агрегаты на сервере | Новая схема/Edge — шире PR; вне «только фронт» |
| **S4** | Client filter page of SKUs | — | **Отклонён:** нужен полный список SKU |

**Рекомендация аудита:** **S1** для MVP (тот же scan, keyed maps). S2 — запасной, если размер cache v3 неприемлем. S3 отложить.

Для `orderableOnly`: в S1 либо отдельные maps `*Orderable`, либо при сборке nav считать только строки с qty>0 в том же accumulate (сейчас categoryCounts считает **все** SKU категории, не только orderable — это отдельно от supplier bug).

### Chip «Только к заказу N»

| Состояние | Сейчас | Предлагаемый MVP |
|-----------|--------|------------------|
| Нет поставщика | `snapshot.orderableCount` | Оставить (вопрос 2 владельцу) |
| Есть поставщик | то же глобальное | `selectedSupplierSummary.orderablePositions` (или 0) |
| Toggle on/off | только фильтр `orderableOnly` | N — индикатор объёма, не обязан меняться от toggle (вопрос: показывать N всегда = «сколько к заказу в текущем scope») |

Реализация: 3–5 строк в JSX chip + возможно хелпер `getOrderableChipCount({ snapshot, summary, supplierId })`.

### Пустые категории после фильтра

После S1 у поставщика останутся только cat/sub с count > 0, **если** nav model строить из supplier-keyed maps и не тащить глобальный `categories[]` без counts. Явно **скрывать count===0** — да (вопрос 4). Иначе снова «Бакалея 0» шум.

### Влияние на flat / keep-previous / sticky

| Тема | Влияние |
|------|---------|
| Flat (search / ABC sort) | Уже фильтрует по `platformSupplierId`; менять fetch не нужно |
| Tree expand | Уже фильтрует; после S1 counts совпадут с листьями |
| Keep-previous | Scope key уже содержит supplier / orderable / abc — ок |
| Sticky / Заказ | Не затрагивается supplier-fix; ABC-колонки — см. §A |
| `plannerCategoryCountsNeedScopeNote` | После S1 при supplier-scope title снова просто «по снимку» **в разрезе поставщика** (или подпись «у поставщика») — убрать честный дисклеймер «без учёта» |
| Cache key | `filterOptions.v2` → `v3` при S1 |

---

## Рекомендуемый MVP (1–2 PR)

### PR 1 — Supplier-scoped tree + chip (корректность)

1. S1: supplier-keyed category/pair counts в accumulate + finalize; bump cache v3.  
2. `buildPlannerCategoryNavModel(filterOptions, { platformSupplierId, orderableOnly? })` — срез; скрыть нули.  
3. Chip N: без supplier → `snapshot.orderableCount`; с supplier → `orderablePositions`.  
4. Подпись counts: «у поставщика» / сохранить «по снимку» с уточнением scope.  
5. Verify: tree asserts на supplier slice + chip source; регресс header/pagination.  
6. **Не** трогать ABC layout в этом PR.

### PR 2 — ABC separate columns (читаемость)

1. Три `th`/`td` К/В/П + sort chevrons + «?» у группы.  
2. `TABLE_COL_SPAN` 17→19; CSS узкие колонки.  
3. Обновить abc-analysis / weeks / tree verifies.  
4. Advanced A/B/C filter оставить как есть, пока владелец не попросит воронку в th.

Если владелец настоит на одном PR — технически можно смешать (оба фронт), но риск ревью выше; аудит предпочитает **два**.

---

## Вопросы владельцу (макс. 5)

1. **Без выбранного поставщика** — дерево всего снимка (как сейчас) — **ОК?**  
2. **Chip N:** без поставщика = `snapshot.orderableCount`; с поставщиком = его `orderablePositions` (и 0, если нет)?  
3. **ABC:** в th только **sort-стрелки**, или ещё filter по классу A/B/C (сейчас фильтр в advanced)?  
4. **Пустые категории** после фильтра поставщика — **скрывать**?  
5. **Один PR** или **ABC отдельно** от supplier-tree? (рекомендация аудита: отдельно, supplier первым)

---

## Preflight исполнителя (когда пойдёт реализация)

1. Не грузить все SKU в память ради counts.  
2. Не P3 / page-cache.  
3. Leaf `fetchSnapshotItemsPage` с supplier уже корректен — не ломать.  
4. Verify: tree + header + weeks + abc-analysis + pagination/desktop регресс.  
5. Коммит/push — только по команде владельца.
