# Аудит — отдельная колонка «Штрихкод» в Planning

**Направление:** только аудит (без правок кода, без коммитов).  
**Дата:** 2026-08-22.  
**Экран:** Закупки → Планирование — `ProcurementPlannerView.jsx` / `.css`.  
**Запрос владельца:** колонка «Штрихкод» сразу после «Товар»; на SKU — только в новой колонке; на строках категорий/подкатегорий — пустая ячейка; заголовок всегда в `<thead>`.

**Read-only verify (на момент аудита):**
- `npm run verify:procurement-planner-tree` — **38/38**
- `npm run verify:procurement-planner-reserve-days` — **18/18**

---

## Вердикт

Изменение **локальное и реалистичное** (только UI planner + CSS + verify). Backend, export, search и sticky «Заказ» справа **не ломаются**. Главная сложность — **перестройка `renderTreeGroupRow`**: сейчас группа категории занимает **одну** `<td colSpan={TABLE_COL_SPAN}>`, а владелец хочет **отдельную пустую ячейку штрихкода** → групповая строка должна перейти на схему «несколько `<td>` + `colSpan` на хвост», иначе колонки thead/tbody не совпадут. Sticky для штрихкода **не обязателен** (рекомендация: не sticky); product можно **сузить** после выноса subtitle.

---

## 1. Desktop — текущее состояние и точки вставки

### `<thead>` (`ProcurementPlannerView.jsx` ~2043–2085)

Сейчас после sticky-слева:

| Порядок | Заголовок | Класс |
|---------|-----------|-------|
| 1 | № | `proc-planner__col-num proc-planner__sticky-num` |
| 2 | Товар | `proc-planner__col-product proc-planner__sticky-product` |
| 3–5 | К / В / П | `proc-planner__col-abc-axis` ×3 |
| 6–13 | W1…W8 | `proc-planner__col-week` |
| 14–20 | Остаток, Запас/дн, Спрос/дн, Норма, Рек., Заказ, Поставщик | … |

**Штрихкода в thead нет.** Заголовок `<thead>` рендерится **вне** tree/flat веток — уже соответствует требованию «всегда виден, даже когда дерево свёрнуто». Достаточно вставить:

```jsx
<th className="proc-planner__col-barcode">Штрихкод</th>
```

**сразу после** `<th …>Товар</th>`, **до** `ABC_AXES.map`.

### `renderDesktopSkuRow` (~1315–1374)

SKU-строка:

```1324:1328:src/components/procurement/ProcurementPlannerView.jsx
        <td className="proc-planner__col-product proc-planner__sticky-product">
          <div className={`proc-planner__product${indent ? ' is-tree-child' : ''}`}>
            <strong title={item.productName}>{item.productName}</strong>
            <span title={item.barcode}>{item.barcode}</span>
          </div>
        </td>
```

**План правки:**
- Убрать `<span title={item.barcode}>…</span>` из `.proc-planner__product`.
- После `</td>` product добавить:

```jsx
<td className="proc-planner__col-barcode" title={item.barcode || undefined}>
  {item.barcode || '—'}
</td>
```

- `title` на ячейке сохраняет полный штрихкод при ellipsis (как сейчас на span).
- Значение **строкой** (`item.barcode`), не `Number()` — важно для leading zeros.

Flat list и tree SKU оба идут через `renderDesktopSkuRow` — одна точка изменения.

### `renderTreeGroupRow` (~1431–1474)

Сейчас **вся** группа — одна ячейка:

```1442:1443:src/components/procurement/ProcurementPlannerView.jsx
      <tr key={key} className={`proc-planner__tree-group depth-${depth}`}>
        <td colSpan={TABLE_COL_SPAN}>
```

**Не соответствует** требованию «пустая ячейка штрихкода»: при добавлении `<th>Штрихкод</th>` colspan-строка съедет под первые две колонки (№+Товар), а штрихкод-колонка останется без tbody-ячейки.

**Рекомендуемая разметка группы:**

| `<td>` | Содержимое |
|--------|------------|
| № | пусто (или `aria-hidden`) |
| Товар | toggle + label + meta (текущий inner) |
| **Штрихкод** | **пусто** |
| `colSpan={TABLE_COL_SPAN - 3}` | пусто / фон группы |

Альтернатива (хуже): 21 отдельных `<td>`, большинство пустых — избыточно.

### Прочие desktop rows с `colSpan`

| Место | Поведение | Действие |
|-------|-----------|----------|
| `renderBranchSkuBlock` loading/empty/«Ещё» | `colSpan={TABLE_COL_SPAN}` | OK — full-width служебные строки |
| `renderTreeTableBody` loading / «Нет категорий» | full span | OK |
| Flat loading / «Нет позиций» | full span | OK |

Итого: **менять colspan только константу `TABLE_COL_SPAN`**, кроме **рефактора group row**.

---

## 2. `TABLE_COL_SPAN`

### Текущая формула

```105:106:src/components/procurement/ProcurementPlannerView.jsx
/** № + Товар + К + В + П + 8 weeks + Остаток + Запас/дн + Спрос/дн + Норма + Рек. + Заказ + Поставщик */
const TABLE_COL_SPAN = 5 + PLANNER_WEEK_COLUMN_COUNT + 7
```

При `PLANNER_WEEK_COLUMN_COUNT = 8` → **20** колонок.

Расшифровка «5»: № + Товар + 3×ABC.

### Новая формула

```text
TABLE_COL_SPAN = 6 + PLANNER_WEEK_COLUMN_COUNT + 7   // = 21 при 8 неделях
```

«6» = № + Товар + **Штрихкод** + К + В + П.

**Все** вхождения `colSpan={TABLE_COL_SPAN}` (8 мест в JSX) остаются валидными после +1 константы; group row после рефактора использует `TABLE_COL_SPAN - 3`.

Комментарий над константой обновить.

---

## 3. Sticky-колонки

### Сейчас (`ProcurementPlannerView.css` ~604–639)

| Класс | `left` / `right` | Ширина |
|-------|------------------|--------|
| `.proc-planner__sticky-num` | `left: 0` | 2.75rem |
| `.proc-planner__sticky-product` | `left: 2.75rem` | 14rem |
| `.proc-planner__sticky-order` | `right: 0` | 5.75rem |

Hover/focus подсветка перечисляет только num / product / order (строки 653–658).

### Нужен ли `.proc-planner__sticky-barcode`?

| Вариант | Плюсы | Минусы |
|---------|-------|--------|
| **A. Не sticky** (рекомендация) | Меньше CSS; sticky-блок уже широкий (№+14rem товара); штрихкод вторичен при горизонтальном скролле недель | При скролле штрихкод уходит вместе с ABC/неделями |
| **B. Sticky после товара** | Штрихкод всегда виден с названием | `left: calc(2.75rem + <width-product>)`; при сужении product пересчёт; +1 z-index/hover rule; суммарная sticky-ширина ~23–25rem |

**Рекомендация аудита:** вариант **A** — штрихкод **не** sticky; пересчитывать только если владелец явно попросит.

При варианте B (если выберут):

```css
.proc-planner__sticky-barcode { left: calc(2.75rem + 14rem); } /* или новая ширина product */
```

и расширить селекторы hover для `sticky-barcode`.

**Заказ (`sticky-order`)** — без изменений (`right: 0`).

---

## 4. CSS

### `.proc-planner__product span` (~829–835)

Subtitle штрихкода: серый, 0.75rem, ellipsis, nowrap. После выноса колонки **span можно удалить** из JSX; правило CSS станет мёртвым — удалить или оставить на случай legacy (лучше удалить в PR).

### `.proc-planner__col-product` (~438–442)

`width/min/max: 14rem` — задавалось под **две строки** (название + штрихкод). Без subtitle:

- **Можно сузить** до ~**10–11rem** (2-line clamp названия остаётся).
- Экономия ~3rem частично компенсирует новую колонку штрихкода.

### Новая `.proc-planner__col-barcode`

Рекомендации:

```css
.proc-planner__col-barcode {
  width: 8.5rem;
  min-width: 8.5rem;
  max-width: 9.5rem;
  font-variant-numeric: tabular-nums;
  font-size: 0.8125rem;
  color: var(--text-secondary, #6b7280);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- **Leading zeros:** рендер `{item.barcode}` как строка (уже так в данных `normalizeItem`: `barcode: row.barcode || ''`).
- **Не** использовать `formatNum` — может испортить отображение.
- EAN-13 (~13 цифр) + padding ≈ 8.5rem достаточно; длинные внутренние коды — `title` + ellipsis.

### `.proc-planner__table min-width` (~793)

Сейчас **1500px**. +1 колонка (~8.5rem ≈ 136px) минус возможное сужение product (~48px) → ориентир **~1580–1600px** или оставить 1500 и проверить руками на 1280px viewport.

---

## 5. Mobile — `renderMobileSkuCard` (~1550–1583)

```1553:1560:src/components/procurement/ProcurementPlannerView.jsx
        <div className="proc-planner__card-top">
          <strong>…{item.productName}</strong>
          <span>{item.barcode}</span>
        </div>
```

`.proc-planner__card-top` — column flex; barcode второй строкой под названием (как desktop subtitle).

### Предложение layout parity

| Вариант | Описание |
|---------|----------|
| **M1 (минимальный)** | Оставить barcode в `card-top`, убрать только desktop subtitle — mobile без изменений |
| **M2 (parity, рекомендация)** | `card-top` — только название; в `card-grid` добавить строку **`Штрихкод <b>…</b>`** первой или после «Остаток» (логически рядом с идентификацией SKU) |
| **M3** | Отдельная строка `Штрихкод:` с `font-variant-numeric: tabular-nums` вне grid |

Tree mobile (`renderMobileBranchCards`) использует те же карточки — parity автоматически.

Group rows на mobile — отдельные `.proc-planner__tree-mobile-group`, штрихкод не показывается (OK).

---

## 6. Tree — group vs SKU vs служебные строки

| Тип строки | Desktop сейчас | После изменения |
|------------|----------------|-----------------|
| Category / subcategory group | 1× `colSpan=TABLE_COL_SPAN` | № пусто + Товар (группа) + **Штрихкод пусто** + `colSpan=TABLE_COL_SPAN-3` |
| SKU (flat / tree branch) | barcode в product | barcode только в `col-barcode` |
| Loading / empty / «Ещё · N» | full `TABLE_COL_SPAN` | без изменений логики (только 21) |
| Tree root «Нет категорий» | full span | без изменений |

**Depth indent** (`is-tree-child` на product) — только для SKU, не для group row.

---

## 7. Вне скоупа — не ломается?

| Контур | Файл / поведение | Вывод |
|--------|------------------|-------|
| Export плана (5 кол.) | `procurementPlanExport.js` — `['№','Товар','Штрихкод','Поставщик','Заказ']` | **Не трогать**; planner UI ≠ export mapping |
| PO / snapshot RPC | SQL, Edge `umag-procurement` | **Не трогать** |
| Search | `placeholder="Товар или штрихкод…"`; `procurementPlanningService` `.or(product_name.ilike, barcode.ilike)` | **Не ломается** — только отображение |
| Order history по barcode | `fetchSnapshotSkuOrderHistory(snapshotId, barcode)` | **Не ломается** |
| `item.barcode` в данных | уже на item | без миграций |

---

## 8. Verify — скрипты с hardcoded span / barcode

| Скрипт | Что зацепит PR | Действие |
|--------|----------------|----------|
| **`verify-procurement-planner-reserve-days.mjs`** | `TABLE_COL_SPAN … + 7` с lead **5**; assert `!colSpan={20}` | lead **6**; literal 20→**21** |
| **`verify-procurement-planner-weeks.mjs`** | regex `5 + … + 7` | lead **6** |
| **`verify-procurement-abc-analysis.mjs`** | `5 + … + 7` или `TABLE_COL_SPAN = 20` | lead **6** / **21** |
| **`verify-procurement-planner-tree.mjs`** | `title={item.barcode}` на product; `col-product` **14rem** | barcode title на **новой ячейке**; ширина product может измениться |
| `verify-procurement-planning-v1.mjs` | export 5 col, planner col-num | скорее **без изменений** |
| `verify-procurement-desktop-ux.mjs` | нет asserts barcode/col-span | **без изменений** |
| **Новый (рекомендация)** | `verify-procurement-planner-barcode-column.mjs` | thead «Штрихкод»; нет span под product; `TABLE_COL_SPAN = 6 + …`; group row pattern |

Прогон после реализации (минимум):

```bash
npm run verify:procurement-planner-barcode-column   # новый
npm run verify:procurement-planner-tree
npm run verify:procurement-planner-weeks
npm run verify:procurement-abc-analysis
npm run verify:procurement-planner-reserve-days
npm run verify:procurement-planning-v1
```

---

## 9. Риски

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| **Tree group row** colspan mismatch | Высокая при naïve diff | Рефактор group → 3 leading `<td>` + tail span; ручной smoke expand/collapse |
| **Table min-width / horizontal scroll** | Средняя | +8.5rem col; optional сузить product; bump min-width |
| **Sticky z-index / hover** | Низкая (если barcode не sticky) | Не добавлять sticky-barcode |
| **verify-procurement-planner-tree** `14rem` assert | Средняя при сужении product | Обновить expected width или оставить 14rem |
| **Flat vs tree parity** | Низкая | Один `renderDesktopSkuRow` |
| **Пустой barcode** | Низкая | показывать «—», не ломать sort/search |

---

## 10. Черновик этапов B1–B4

### B1 — Span + thead + CSS scaffold

- `TABLE_COL_SPAN = 6 + PLANNER_WEEK_COLUMN_COUNT + 7`
- `<th>Штрихкод</th>` после «Товар»
- CSS `.proc-planner__col-barcode`; опционально сузить `.proc-planner__col-product`
- Verify: обновить weeks / abc / reserve-days span asserts

**Приёмка B1:** thead 21 колонка; verify span зелёные; SKU rows ещё могут быть старыми (временно misaligned) — лучше не мержить B1 отдельно.

### B2 — Desktop SKU rows

- `renderDesktopSkuRow`: убрать span, добавить `<td className="proc-planner__col-barcode">`
- Удалить/упростить `.proc-planner__product span` CSS

**Приёмка B2:** flat list — штрихкод только в колонке; product — одна строка (clamp 2 lines).

### B3 — Tree group rows + min-width

- Рефактор `renderTreeGroupRow` → пустая №, группа в product, **пустой barcode**, tail colspan
- Подстроить `.proc-planner__table min-width`
- Обновить `verify-procurement-planner-tree` (`title={item.barcode}` placement)

**Приёмка B3:** expand category — колонки aligned; group row — пустая ячейка под «Штрихкод»; «Ещё · N» full width.

### B4 — Mobile + dedicated verify + plan

- Mobile layout (M2): labeled «Штрихкод» в grid или card-top parity
- `verify-procurement-planner-barcode-column.mjs` + `package.json`
- `docs/procurement/plan-planner-barcode-column.md` (если создавать plan-doc)

**Приёмка B4 (полная серия):**

1. Desktop thead: … Товар | **Штрихкод** | К | … (всегда виден).
2. SKU: barcode **не** под названием; в колонке; leading zeros сохранены.
3. Tree group: **пустая** ячейка штрихкода; loading/empty — full span.
4. Mobile: штрихкод читаем, с подписью (если M2).
5. Export 5 col, search, RPC — без diff.
6. Verify из §8 — все зелёные.

---

## Findings (кратко)

- **Штрихкод уже в данных и search**, но в UI спрятан subtitle под «Товар»; вынос — чисто presentation-layer, **без backend**.
- **`renderTreeGroupRow` — главный блокер**: single-`colSpan` несовместим с отдельной пустой ячейкой штрихкода; нужен рефактор на 3+1 ячейки.
- **Verify-цепочка** после reserve-days жёстко привязана к lead **`5`** и span **20** — при +1 колонке обновить минимум **3 скрипта** + добавить dedicated verify.

---

## Вопросы владельцу (до реализации)

1. **Sticky:** штрихкод должен оставаться видимым при горизонтальном скролле (sticky вместе с №+Товар) или может уезжать вместе с ABC/неделями?
2. **Ширина «Товар»:** сужать с 14rem до ~10–11rem после выноса штрихкода или оставить 14rem?
3. **Mobile parity:** оставить штрихкод под названием (как сейчас) или вынести в labeled row «Штрихкод» в card-grid (M2)?
4. **Пустой штрихкод в данных:** показывать «—» в колонке (как поставщик) или оставлять пустую ячейку?
