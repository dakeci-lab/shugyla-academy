# План: колонка «Запас/дн» в Planning + rename «Спрос/дн»

**Статус:** P1–P4 реализованы (verify зелёный; коммит — только по команде владельца).  
**Дата:** 2026-08-22.  
**Формат:** серия **P1 → P4** (math → desktop → mobile/tree → verify) — выполнена одним squashed diff.  
**Verify:** `npm run verify:procurement-planner-reserve-days`, `verify:procurement-planning-v1`, `verify:procurement-planner-weeks`, `verify:procurement-abc-analysis`, `verify:procurement-planner-tree`, `verify:procurement-desktop-ux`.

---

## Закрытые решения владельца

| # | Тема | Решение |
|---|------|---------|
| 1 | Подписи | «Ср/день» → **«Спрос/дн»**; новая колонка **«Запас/дн»** между **Остаток** и **Спрос/дн** |
| 2 | Формула | `Запас/дн = round(calculationStock / avgDaily)`; при `avgDaily ≤ 0` → **«—»** |
| 3 | Остаток в формуле | **`calculationStock`** (не `rawStock`) |
| 4 | Формат | Целое число дней (без дробной части в UI) |
| 5 | Backend / export | Export заказа (5 колонок), RPC, `snapshot_items`, Edge **`umag-procurement`** — **не трогать**, только UI + math helper + verify (если mini-audit не найдёт иное) |

---

## Цель

Дать закупщику в таблице Планирования **читаемый горизонт покрытия остатка** в днях спроса: «на сколько дней хватит расчётного остатка при текущем среднесуточном спросе», без изменения логики заказа, sync и экспорта.

Переименование «Ср/день» → «Спрос/дн» согласует подпись с смыслом поля (`avgDaily = sum(8 нед.) / 56`).

### Non-goals

- Новое поле в БД / миграции / persist «Запас/дн» в `procurement_snapshot_items`
- Изменение формулы **Рек.** (`max(0, round(avgDaily × normDays − calculationStock))`)
- Export плана (`PLAN_EXPORT_COLUMNS`: 5 колонок), PDF/XLSX заказа, `mapSnapshotItemToPurchaseOrderItem`
- Edge sync, RLS, snapshot guard, ABC, дерево категорий (логика fetch), keep-previous pagination
- Показ `rawStock` vs `calculationStock` в колонке «Остаток» (остаётся как сейчас — `rawStock` + tooltip при отрицательном)
- Новые UI-библиотеки / Tailwind

---

## Mini-audit (A0, встроенный)

Проверено по коду на 2026-08-22; отдельный `audit-*.md` не создавался.

### Текущая desktop-таблица (`ProcurementPlannerView.jsx`)

Порядок колонок после ABC и 8 недель:

| # | Заголовок | Поле / источник | Примечание |
|---|-----------|-----------------|------------|
| … | 8× недели | `weeklySales[i]` | `PLANNER_WEEK_COLUMN_COUNT = 8` |
| 1 | Остаток | **`rawStock`** (+ `negativeStock`) | В расчёте рек. — `calculationStock = max(0, raw)` |
| 2 | Ср/день | `avgDaily` | `formatNum(..., 2)` |
| 3 | Норма | `normDays` | read-only |
| 4 | Рек. | `recommendedQty` | |
| 5 | Заказ | `finalOrderQty` | sticky |
| 6 | Поставщик | `umagSupplierName` | |

`TABLE_COL_SPAN = 5 + PLANNER_WEEK_COLUMN_COUNT + 6` → **19** (№, Товар, К, В, П + 8 нед. + 6 хвостовых).

### Целевой порядок (после PR)

`… + Остаток + **Запас/дн** + Спрос/дн + Норма + Рек. + Заказ + Поставщик`  
→ хвостовых колонок **7** → `TABLE_COL_SPAN = 5 + PLANNER_WEEK_COLUMN_COUNT + **7**`.

### Math (`src/utils/procurementPlanningMath.js`)

- Есть: `calcAvgDaily`, `calcCalculationStock`, `calcRecommendedQty`, `applyNormDaysChange`.
- **Нет** helper для «дней запаса» — добавить в P1 (`calcReserveDays` или аналог).
- `mapSnapshotItemToPurchaseOrderItem` пишет `stock_qty` из `calculationStock` — **не менять** (export contract).

### Export / RPC / Edge

| Контур | Файл / место | Вывод аудита |
|--------|----------------|--------------|
| Export плана | `procurementPlanExport.js` — `PLAN_EXPORT_COLUMNS` = 5 колонок | **Вне скоупа** |
| PO export | `mapPurchaseOrderForExport` | **Вне скоупа** |
| Snapshot items | SQL + `procurementPlanningService.normalizeItem` | Поля `calculation_stock`, `avg_daily` уже есть; **новую колонку не persist** |
| Edge sync | `umag-procurement/index.ts` — `calcRecommendedQty` | **Не трогать** |
| Рек. на сервере | SQL `round(avg_daily * norm_days - calculation_stock)` | **Не трогать** |

**Итог mini-audit:** достаточно **derived UI + pure math helper**; backend/export не затрагиваются.

### Mobile / tree

- Mobile card (`renderMobileSkuCard`): сетка «Остаток / Ср/день / Норма / Заказ» — вставить **Запас/дн** между Остаток и Спрос/дн.
- Tree mode: те же `renderDesktopSkuRow` / `renderMobileSkuCard`; `colSpan={TABLE_COL_SPAN}` в loading/empty/group rows — **+1**.

### Verify, завязанные на `TABLE_COL_SPAN`

| Скрипт | Риск |
|--------|------|
| `verify-procurement-planner-weeks.mjs` | regex `+ 6` → **`+ 7`** |
| `verify-procurement-abc-analysis.mjs` | то же + literal `TABLE_COL_SPAN = 19` → **20** |
| `verify-procurement-planning-v1.mjs` | расширить runtime-тесты math; static на planner при необходимости |

### CSS / layout

- `.proc-planner__table { min-width: 1460px }` — после +1 колонки возможен лёгкий underflow; рассмотреть **+3–4rem** или узкую колонку «Запас/дн» (`tabular-nums`, `text-align: right`).
- Sticky: только № / Товар / Заказ — **новая колонка не sticky** (как «Остаток» и «Спрос/дн»).
- Горизонтальный скролл `.proc-planner__table-wrap` — сохранить.

### Связанные доки (контекст, не блокер)

- `docs/procurement/audit-planner-table-informativeness.md` — упоминает «Ср/день»; после реализации можно одной строкой обновить таблицу колонок (не обязательно в том же PR).

---

## Файлы (ожидаемые изменения)

| Файл | Этап | Что |
|------|------|-----|
| `src/utils/procurementPlanningMath.js` | P1 | `calcReserveDays(calculationStock, avgDaily)` + JSDoc формулы |
| `src/components/procurement/ProcurementPlannerView.jsx` | P2–P3 | thead, `renderDesktopSkuRow`, mobile card, `TABLE_COL_SPAN`, rename подписей |
| `src/components/procurement/ProcurementPlannerView.css` | P2–P3 | ширина/выравнивание колонки «Запас/дн»; при необходимости `min-width` таблицы |
| `scripts/verify-procurement-planning-v1.mjs` | P1, P4 | runtime cases для reserve days |
| `scripts/verify-procurement-planner-weeks.mjs` | P4 | `TABLE_COL_SPAN` tail **7** |
| `scripts/verify-procurement-abc-analysis.mjs` | P4 | то же |
| **`scripts/verify-procurement-planner-reserve-days.mjs`** | P4 | **новый** + `verify:procurement-planner-reserve-days` в `package.json` |
| `docs/procurement/plan-planner-reserve-days-column.md` | — | статус этапов после реализации |

**Не трогать (явно):** `procurementPlanExport.js`, `umag-procurement`, migrations, `procurementPlanningService` fetch contract, careers/прочие модули.

---

## PR P1 — Math helper + tests

**Статус этапа:** реализация сделана.

**Ветка (рекомендация):** `cursor/planner-reserve-days-math`  
**Зависимости:** нет.

### Реализация

Добавить в `procurementPlanningMath.js`:

```js
/**
 * Days of cover at current demand: round(calculationStock / avgDaily).
 * Returns null when avgDaily <= 0 (UI shows «—»).
 */
export function calcReserveDays(calculationStock, avgDaily) {
  const stock = Number(calculationStock)
  const avg = Number(avgDaily)
  if (!Number.isFinite(stock) || !Number.isFinite(avg) || avg <= 0) return null
  return Math.round(stock / avg)
}
```

Опционально (по желанию ревьюера, не обязательно): `formatReserveDays(value)` → `'—'` для `null`, иначе целое через `toLocaleString('ru-KZ')`. Можно оставить форматирование в JSX через существующий `formatNum` / локальную функцию.

### Тест-кейсы (runtime в verify)

| calculationStock | avgDaily | Ожидание |
|------------------|----------|----------|
| 10 | 2 | **5** |
| 11 | 4 | **3** (round) |
| 0 | 1.5 | **0** |
| 5 | 0 | **null** → «—» |
| 5 | -1 | **null** |
| NaN / undefined | 2 | **null** или **0** по guard stock (зафиксировать в тесте) |

**Не путать:** при `rawStock < 0` UI показывает отрицательный остаток, но `calculationStock = 0` → reserve days **0**, не «—».

### Verify P1

- Расширить **`verify-procurement-planning-v1.mjs`** (stage math): import + table cases выше.
- Planner JSX **ещё не менять** — P1 можно мержить отдельно или сразу в series branch.

### Приёмка P1

- `npm run verify:procurement-planning-v1` — зелёный.
- Helper экспортирован, использует только `calculationStock` + `avgDaily`.

---

## PR P2 — Desktop thead + row + TABLE_COL_SPAN +1

**Статус этапа:** реализация сделана.

**Ветка:** `cursor/planner-reserve-days-desktop`  
**Зависит от:** P1 (import helper).

### UX desktop

1. Комментарий и константа:
   - `/** … + Остаток + Запас/дн + Спрос/дн + Норма + … */`
   - `TABLE_COL_SPAN = 5 + PLANNER_WEEK_COLUMN_COUNT + 7`
2. `<thead>`: после `<th>Остаток</th>` добавить `<th>Запас/дн</th>`, следующий заголовок **«Спрос/дн»** (было «Ср/день»).
3. `renderDesktopSkuRow`: после ячейки остатка (`rawStock`) — новая `<td>`:
   - значение: `calcReserveDays(item.calculationStock, item.avgDaily)`
   - `null` → «—»
   - иначе целое (без дробных знаков)
   - опциональный `title`: «Запас/дн = round(расч. остаток ÷ спрос/день)» для power users
4. Следующая ячейка: rename label только в header/mobile; data — по-прежнему `formatNum(item.avgDaily, 2)`.

### CSS P2

- Класс например `.proc-planner__col-reserve` — `text-align: right`, `tabular-nums`, компактная `min-width` (~3rem).
- Проверить hover row + sticky «Заказ» — z-index не ломается.
- При необходимости поднять `.proc-planner__table min-width` (1460 → ~1500px).

### Verify P2 (частично)

- Static в новом verify (P4) или временно в planner-weeks после merge P2.

### Приёмка P2 (ручная)

- Desktop flat list: колонки в порядке **Остаток → Запас/дн → Спрос/дн → …**
- SKU с `avgDaily = 0`: «Запас/дн» = **—**
- SKU с отриц. UMAG остатком: «Остаток» красный; «Запас/дн» = **0** (если `calculationStock = 0`)
- Loading / «Нет позиций» / tree group rows — colspan на всю ширину (19→**20**)

---

## PR P3 — Mobile + tree

**Статус этапа:** реализация сделана.

**Ветка:** `cursor/planner-reserve-days-mobile-tree`  
**Зависит от:** P2.

### Mobile card

В `renderMobileSkuCard`, блок `.proc-planner__card-grid`:

```text
Остаток …
Запас/дн …   ← новый span
Спрос/дн …   ← rename (было Ср/день)
Норма …
Заказ …
```

Тот же helper `calcReserveDays(item.calculationStock, item.avgDaily)`.

### Tree mode

- Desktop tree SKU rows — уже через `renderDesktopSkuRow` (P2).
- Mobile tree branches — через `renderMobileSkuCard` (P3).
- Все `colSpan={TABLE_COL_SPAN}` без hardcoded чисел.

### CSS P3

- Сетка карточки: при 5 метриках в grid проверить перенос на узком экране (~320px); при необходимости `grid-template-columns` как сейчас (2 col) — «Запас/дн» не обрезается.

### Приёмка P3 (ручная)

- Mobile + tree expanded: подписи **Запас/дн** / **Спрос/дн**
- «Ещё · N» / loading tree — colspan корректен
- ABC / недели / sticky desktop — без регрессий

---

## PR P4 — Verify + ручная приёмка + plan status

**Статус этапа:** реализация сделана.

**Ветка:** `cursor/planner-reserve-days-verify`  
**Зависит от:** P1–P3 (или один squashed PR series).

### Новый verify

**`scripts/verify-procurement-planner-reserve-days.mjs`** + **`npm run verify:procurement-planner-reserve-days`**

Минимальные asserts:

| # | Assert |
|---|--------|
| 1 | `procurementPlanningMath.js` exports `calcReserveDays` |
| 2 | Runtime: table cases P1 (5, 3, 0, null…) |
| 3 | Planner: `<th>Запас/дн</th>` между Остаток и Спрос/дн |
| 4 | Planner: `<th>Спрос/дн</th>`; **нет** `<th>Ср/день</th>` |
| 5 | Planner: `calcReserveDays` import + `item.calculationStock` в row (не `rawStock` для reserve) |
| 6 | `TABLE_COL_SPAN` uses `+ 7` tail (или literal 20 with week count 8) |
| 7 | Mobile: строка «Запас/дн» и «Спрос/дн» |
| 8 | `mapSnapshotItemToPurchaseOrderItem` / `PLAN_EXPORT_COLUMNS` **unchanged** (5 cols) — regression guard |

### Обновить существующие verify

| Скрипт | Изменение |
|--------|-----------|
| `verify-procurement-planner-weeks.mjs` | `+ 6` → **`+ 7`** |
| `verify-procurement-abc-analysis.mjs` | то же; optional literal 20 |
| `verify-procurement-planning-v1.mjs` | math tests (если не в P1) |

### Полный прогон перед сдачей владельцу

```bash
npm run verify:procurement-planner-reserve-days   # новый
npm run verify:procurement-planning-v1
npm run verify:procurement-planner-weeks
npm run verify:procurement-abc-analysis
npm run verify:procurement-planner-tree
npm run verify:procurement-desktop-ux
```

### Критерии приёмки (серия)

1. **Подписи:** desktop header + mobile — «Запас/дн», «Спрос/дн»; литерала «Ср/день» в planner UI нет.
2. **Формула:** UI использует `calculationStock` и `avgDaily`; при `avgDaily ≤ 0` — «—».
3. **Формат:** целые дни; `round` как в helper.
4. **Порядок:** колонка строго между Остаток и Спрос/дн.
5. **Регрессии:** Рек./Заказ/экспорт/sync не изменились; verify зелёные.
6. **Tree / pagination / sticky:** loading-empty-group colspan = `TABLE_COL_SPAN`; горизонтальный скролл работает.

### Риски

| Риск | Митигация |
|------|-----------|
| **Горизонтальный скролл** таблицы станет шире | Узкая колонка «Запас/дн»; bump `min-width` таблицы; sticky №/товар/заказ сохранить |
| **Sticky «Заказ»** перекрывает соседние ячейки | Не делать reserve sticky; проверить z-index на hover |
| **`avgDaily = 0`** (нет спроса 8 нед.) | «—», не делить; явный тест + tooltip «нет спроса» опционально |
| Путаница **raw vs calc** остаток | «Остаток» колонка — как сейчас raw; tooltip negative stock; reserve **только** calc |
| Verify **`+ 6`** hardcoded в нескольких скриптах | Обновить все в P4 одним коммитом |
| Владелец ожидает persist «Запас/дн» в export | Out of scope; в plan зафиксировано — только UI |

### Plan doc после реализации

Отметить P1–P4 **done**, verify commands, «коммит по команде владельца».

---

## Порядок выкладки и сообщения коммитов

```text
P1 math helper + planning-v1 verify cases
  → P2 desktop column + TABLE_COL_SPAN +7
    → P3 mobile + tree labels
      → P4 dedicated verify + fix planner-weeks/abc span asserts
```

Ориентир сообщений:

```text
feat(procurement): P1 calcReserveDays helper for planner
feat(procurement): P2 desktop Запас/дн column and Спрос/дн rename
feat(procurement): P3 mobile/tree reserve days labels
chore(procurement): P4 verify planner reserve days column
```

Один squashed PR допустим, если владелец предпочитает одну тему «reserve days column».

---

## Preflight исполнителя (каждый PR)

1. Прочитать этот plan + mini-audit §.
2. Дифф **только** по файлам этапа.
3. Прогнать verify этапа (см. P1–P4).
4. **Не коммитить**, пока владелец не попросит.

---

## Резюме P1 → P4

| Этап | Суть | Ключевой результат |
|------|------|-------------------|
| **P1** | `calcReserveDays` в `procurementPlanningMath.js` + runtime tests | Чистая формула `round(calculationStock/avgDaily)`, null при avg≤0 |
| **P2** | Desktop: `<th>`/`<td>`, `TABLE_COL_SPAN +1`, rename «Спрос/дн» | Колонка «Запас/дн» между Остаток и спросом; tail **7** |
| **P3** | Mobile card + tree (те же row renderers) | Параity desktop/mobile/tree; без backend |
| **P4** | `verify-procurement-planner-reserve-days` + правки weeks/abc/planning-v1 | Регрессионная сетка; приёмка и статус **complete** в plan |

**Итог серии:** закупщик видит **дни покрытия** рядом с остатком и переименованным **спросом/день**, без изменения заказа, sync, snapshot schema и export.
