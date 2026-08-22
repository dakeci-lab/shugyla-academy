# План: колонка «Штрихкод» в Planning

**Статус:** B1–B3 реализованы (verify зелёный; коммит — только по команде владельца).  
**Дата:** 2026-08-22.  
**Формат:** серия **B1 → B3** (desktop → mobile → verify) — выполнена одним squashed diff.  
**Verify:** `npm run verify:procurement-planner-barcode-column`, `verify:procurement-planner-tree`, `verify:procurement-planner-weeks`, `verify:procurement-planner-reserve-days`, `verify:procurement-abc-analysis`, `verify:procurement-desktop-ux`.

---

## Закрытые решения владельца

| # | Тема | Решение |
|---|------|---------|
| 1 | Заголовок | **«Штрихкод»** сразу после «Товар» в `<thead>` (всегда виден) |
| 2 | SKU | Barcode **только** в новой колонке; убрать из `.proc-planner__product` |
| 3 | Tree group | Пустая ячейка «Штрихкод»; рефактор `renderTreeGroupRow`: № (пусто) → Товар (toggle+label) → Штрихкод (пусто) → tail `colSpan={TABLE_COL_SPAN - 3}` |
| 4 | Sticky | **№ + Товар + Штрихкод**; пересчёт `left` (см. B1) |
| 5 | Span | `TABLE_COL_SPAN = 6 + PLANNER_WEEK_COLUMN_COUNT + 7` → **21** при 8 неделях |
| 6 | CSS | Product **~11rem**; barcode `tabular-nums`, ellipsis, `title` на `<td>` |
| 7 | Mobile | Labeled **«Штрихкод»** (не под названием в `card-top`) |
| 8 | Пусто | Пустой barcode на SKU и group rows — **пустая ячейка**, не «—» |
| 9 | Backend | Export 5 col, RPC, Edge, search — **не трогать** |

---

## Цель

Вынести штрихкод SKU из subtitle под названием в **отдельную колонку** desktop-таблицы Planning (и labeled field на mobile), сохранив выравнивание thead/tbody в flat и tree mode, sticky-идентификацию слева (№ + товар + штрихкод) и без изменений sync/export/search.

### Non-goals

- Миграции / новые поля в `procurement_snapshot_items`
- `procurementPlanExport.js`, PO export, Edge `umag-procurement`, SQL RPC
- Изменение search (`Товар или штрихкод…`, `barcode.ilike`) — только UI
- Сортировка по штрихкоду (нет в scope)
- Copy-to-clipboard, monospace font-family (опционально позже)
- Новые UI-библиотеки / Tailwind

---

## Файлы (ожидаемые)

| Файл | Этап | Что |
|------|------|-----|
| `src/components/procurement/ProcurementPlannerView.jsx` | B1–B2 | thead, SKU row, tree group, mobile card |
| `src/components/procurement/ProcurementPlannerView.css` | B1–B2 | col widths, sticky left, barcode/product |
| `scripts/verify-procurement-planner-barcode-column.mjs` | B3 | **новый** |
| `scripts/verify-procurement-planner-tree.mjs` | B3 | barcode title placement, product width |
| `scripts/verify-procurement-planner-weeks.mjs` | B3 | lead **6**, span 21 |
| `scripts/verify-procurement-abc-analysis.mjs` | B3 | lead **6**, literal 21 |
| `scripts/verify-procurement-planner-reserve-days.mjs` | B3 | lead **6** |
| `package.json` | B3 | `verify:procurement-planner-barcode-column` |
| `docs/procurement/plan-planner-barcode-column.md` | — | статус после реализации |

---

## B1 — Desktop (thead, SKU row, tree group, sticky, span)

**Статус этапа:** реализация сделана.

**Ветка (рекомендация):** `cursor/planner-barcode-column-desktop`  
**Зависимости:** нет.

### 1. `TABLE_COL_SPAN`

```js
/** № + Товар + Штрихкод + К + В + П + 8 weeks + Остаток + Запас/дн + Спрос/дн + Норма + Рек. + Заказ + Поставщик */
const TABLE_COL_SPAN = 6 + PLANNER_WEEK_COLUMN_COUNT + 7
```

Все служебные строки (loading, empty, «Ещё · N», «Нет категорий») — по-прежнему `colSpan={TABLE_COL_SPAN}` (теперь 21).

### 2. `<thead>`

После `<th className="… sticky-product">Товар</th>`:

```jsx
<th className="proc-planner__col-barcode proc-planner__sticky-barcode">Штрихкод</th>
```

До `ABC_AXES.map`. Заголовок **не** зависит от treeMode — уже так.

### 3. `renderDesktopSkuRow`

- `.proc-planner__product`: только `<strong title={item.productName}>…</strong>` — **без** `<span>{item.barcode}</span>`.
- Новая ячейка сразу после product:

```jsx
<td
  className="proc-planner__col-barcode proc-planner__sticky-barcode"
  title={item.barcode ? item.barcode : undefined}
>
  {item.barcode || null}
</td>
```

- Рендер пустого: `{item.barcode || null}` или `{item.barcode ? item.barcode : ''}` — **не** «—».
- Значение **строкой** (`item.barcode`), без `Number()` / `formatNum`.

### 4. `renderTreeGroupRow` — рефактор

Заменить single `colSpan={TABLE_COL_SPAN}` на:

```jsx
<tr className={`proc-planner__tree-group depth-${depth}`}>
  <td className="proc-planner__col-num proc-planner__sticky-num" aria-hidden="true" />
  <td className="proc-planner__col-product proc-planner__sticky-product">
    <div className="proc-planner__tree-group-inner">…toggle + label + meta…</div>
  </td>
  <td className="proc-planner__col-barcode proc-planner__sticky-barcode" aria-hidden="true" />
  <td colSpan={TABLE_COL_SPAN - 3} className="proc-planner__tree-group-tail" />
</tr>
```

- № и Штрихкод — **пустые** `<td>` (не `&nbsp;`, не «—»).
- Inner группы перенести из старой colspan-ячейки в product-ячейку.
- Tail-ячейка: фон/граница группы как сейчас у full-row (при необходимости `.proc-planner__tree-group-tail { background: … }`).

Category и subcategory — оба через `renderTreeGroupRow` → одна правка.

### 5. Sticky — три колонки слева

Текущие якоря (`.proc-planner__col-num` = **2.75rem**):

| Колонка | Класс sticky | `left` | Ширина col |
|---------|--------------|--------|------------|
| № | `proc-planner__sticky-num` | `0` | 2.75rem |
| Товар | `proc-planner__sticky-product` | `2.75rem` | **11rem** |
| Штрихкод | `proc-planner__sticky-barcode` | **`13.75rem`** (= 2.75 + 11) | **8.5rem** |

**CSS (черновик):**

```css
.proc-planner__col-product {
  width: 11rem;
  min-width: 11rem;
  max-width: 11rem;
}

.proc-planner__col-barcode {
  width: 8.5rem;
  min-width: 8.5rem;
  max-width: 8.5rem;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary, #6b7280);
}

.proc-planner__sticky-num,
.proc-planner__sticky-product,
.proc-planner__sticky-barcode,
.proc-planner__sticky-order { … }

.proc-planner__sticky-barcode { left: 13.75rem; }

/* thead */
.proc-planner__table thead .proc-planner__sticky-barcode { background: #fafbfc; z-index: 3; }

/* hover SKU + group sticky bg */
.proc-planner__table tbody tr.proc-planner__sku-row:hover > td.proc-planner__sticky-barcode,
.proc-planner__table tbody tr.proc-planner__sku-row:focus-within > td.proc-planner__sticky-barcode,
.proc-planner__table tbody tr.proc-planner__tree-group:hover > td.proc-planner__sticky-barcode { … }
```

- **Z-index:** barcode sticky = 2 (body) / 3 (thead), как product.
- **Заказ** справа (`right: 0`) — без изменений.

### 6. Прочий CSS cleanup

- Удалить или не использовать `.proc-planner__product span` (subtitle barcode).
- `.proc-planner__table min-width`: поднять с **1500px** до **~1580–1620px** (sticky block слева ≈ 22.25rem + scrollable middle); уточнить при ручном smoke на 1280px viewport.

### Verify B1 (частично)

Static можно проверить после B1; полный verify — в B3.

### Приёмка B1 (ручная)

1. Flat list: колонки **Товар | Штрихкод | К | …**; barcode не под названием.
2. Tree expanded: group row — пустые № и Штрихкод; toggle в колонке Товар.
3. Горизонтальный скрoll: №+Товар+Штрихкод остаются слева; Заказ справа.
4. SKU без barcode — пустая ячейка (не «—»).
5. Leading zeros в штрихкоде сохранены.

---

## B2 — Mobile

**Статус этапа:** реализация сделана.

**Ветка:** `cursor/planner-barcode-column-mobile`  
**Зависит от:** B1 (тот же squashed diff допустим).

### `renderMobileSkuCard`

**Было:** `card-top` = название + `<span>{item.barcode}</span>`.

**Станет:**

- `card-top`: только название (+ row num).
- В `card-grid` (или отдельной строкой **перед** «Остаток») добавить:

```jsx
<span>
  Штрихкод{' '}
  <b className="proc-planner__card-barcode">{item.barcode || ''}</b>
</span>
```

- Пустой barcode — **пустой** `<b></b>` / без placeholder «—».
- Опционально `title={item.barcode}` на `<b>` при ellipsis.
- CSS: `.proc-planner__card-barcode { font-variant-numeric: tabular-nums; }`

Tree mobile (`renderMobileBranchCards`) — те же карточки, без отдельной правки group UI.

### Verify B2

Покрывается dedicated verify (B3): labeled «Штрихкод», нет barcode в `card-top` span-only pattern.

### Приёмка B2 (ручная)

1. Mobile card: подпись **«Штрихкод»** с значением; название отдельно.
2. Tree branch mobile — тот же layout.
3. Пустой barcode — пустое значение после label.

---

## B3 — Verify

**Статус этапа:** реализация сделана.

**Ветка:** `cursor/planner-barcode-column-verify`  
**Зависит от:** B1–B2.

### Новый `scripts/verify-procurement-planner-barcode-column.mjs`

+ `npm run verify:procurement-planner-barcode-column`

Минимальные asserts:

| # | Assert |
|---|--------|
| 1 | `TABLE_COL_SPAN = 6 + PLANNER_WEEK_COLUMN_COUNT + 7` (literal 21 при count 8) |
| 2 | `<th …>Штрихкод</th>` после Товар; классы `col-barcode`, `sticky-barcode` |
| 3 | `renderDesktopSkuRow`: нет `{item.barcode}` внутри `proc-planner__product` |
| 4 | SKU: `proc-planner__col-barcode` + `title={item.barcode` (или экв.) |
| 5 | SKU row: **нет** `|| '—'` / em-dash fallback для barcode |
| 6 | `renderTreeGroupRow`: `TABLE_COL_SPAN - 3` tail + пустые num/barcode cells |
| 7 | Sticky CSS: `left: 13.75rem` на `.proc-planner__sticky-barcode`; product **11rem** |
| 8 | Mobile: «Штрихкод» label; `card-top` без голого `{item.barcode}` subtitle |
| 9 | `PLAN_EXPORT_COLUMNS` / search placeholder — regression guard unchanged |
| 10 | Group/loading rows still use full `TABLE_COL_SPAN` |

### Обновить существующие

| Скрипт | Изменение |
|--------|-----------|
| `verify-procurement-planner-weeks.mjs` | regex lead `5` → **`6`** |
| `verify-procurement-abc-analysis.mjs` | `+ 6` / literal **`TABLE_COL_SPAN = 20`** → **21** |
| `verify-procurement-planner-reserve-days.mjs` | lead **`6`**; reserve header asserts без регрессии |
| `verify-procurement-planner-tree.mjs` | `title={item.barcode}` на **barcode `<td>`**, не product span; product width **11rem** (если assert 14rem) |

### Полный прогон

```bash
npm run verify:procurement-planner-barcode-column
npm run verify:procurement-planner-tree
npm run verify:procurement-planner-weeks
npm run verify:procurement-abc-analysis
npm run verify:procurement-planner-reserve-days
npm run verify:procurement-planning-v1
npm run verify:procurement-desktop-ux
```

### Plan doc

После реализации: статус **B1–B3 done**, verify commands, «коммит по команде владельца».

---

## Критерии приёмки (серия)

1. Desktop thead: **Товар → Штрихкод → К → …** (21 col); заголовок при свёрнутом дереве.
2. SKU: barcode **только** в колонке; product — одно имя (clamp 2 lines); leading zeros OK.
3. Tree group: **пустые** № и Штрихкод; контент группы в колонке Товар; tail colspan = 18.
4. Sticky: № + Товар + Штрихкод при scroll; hover background на всех трёх.
5. Пустой barcode: **пустая ячейка** (desktop + mobile), не «—».
6. Mobile: labeled «Штрихкод», не subtitle в card-top.
7. Export 5 col, search, RPC — **без diff** в PR.
8. Verify §B3 — все зелёные.

---

## Риски

| Риск | Митигация |
|------|-----------|
| **Tree group colspan drift** | Строго 3 leading `<td>` + `TABLE_COL_SPAN - 3`; smoke expand cat/subcat |
| **Table min-width / overflow** | bump ~1580–1620px; product 11rem + barcode 8.5rem |
| **Sticky z-index stacking** | barcode z-index = product; thead bg #fafbfc |
| **verify-procurement-planner-tree** 14rem assert | обновить на 11rem в том же PR |
| **Flat vs tree SKU parity** | один `renderDesktopSkuRow` |
| **Triple sticky width** | ~22.25rem fixed left — на узком экране больше horizontal scroll (ожидаемо) |

---

## Preflight исполнителя

1. Прочитать audit + этот plan + закрытые решения §.
2. Diff только planner JSX/CSS + verify + package.json script.
3. Прогон verify B3.
4. **Не коммитить**, пока владелец не попросит.

---

## Резюме B1 → B3

| Этап | Суть | Ключевой результат |
|------|------|-------------------|
| **B1** | Desktop: span 21, thead, SKU col, tree group 3+tail, triple sticky | Штрихкод — отдельная колонка; group rows aligned |
| **B2** | Mobile labeled «Штрихкод» | Parity без subtitle в card-top |
| **B3** | Dedicated verify + weeks/abc/reserve/tree updates | Регрессионная сетка; span 20→21 locked |

**Итог серии:** закупщик видит штрихкод в отдельной колонке (и labeled field на mobile) с sticky №+товар+штрихкод слева, без backend/export изменений.

Ориентир commit message (один squashed PR):

```text
feat(procurement): separate barcode column in planner table
```
