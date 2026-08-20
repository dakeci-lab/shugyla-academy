# Аудит — информативность таблицы Планирования vs Focus Pro

**Направление:** только аудит (без правок кода, без коммитов).  
**Дата:** 2026-08-20.  
**Кейс:** владелец сравнивает Закупки → Планирование с Focus Pro: недели отдельными колонками, дерево категорий со счётчиками, акцент на заказе/скорости, шапка смысла (период / формула / к заказу). Нужен реалистичный поэтапный путь под наш стек (React + чистый CSS, PostgREST snapshot, пагинация 25–500).

**Вне скоупа:** keep-previous pagination, HR, UMAG sync/permission bugs, новые UI-библиотеки / Tailwind.

---

## Вердикт

Shugyla уже **хранит почти всё**, что нужно для «читать закуп как Excel»: `weekly_sales[8]`, `category_name` / `subcategory_name`, формула `рек. = max(0, round(ср/день × норма − расч.остаток))`, период снимка, фильтр «только к заказу», default sort уже `category → subcategory → product`. Информативность теряется на **UI-слое**: 8 недель склеены в одну колонку-пилюли, иерархия спрятана мелкой подписью под SKU, Рек./Заказ визуально равноправны ABC и пилюлям, шапка показывает только «обновлён · N SKU», без периода и формулы. Дерево как у Focus Pro **нельзя** честно собрать только на текущей странице flat `range` — главный риск; жизнеспособный путь: сначала недели + акценты/шапка (фронт), затем dual-mode «по категориям» на уже существующих фильтрах / drill-down, и только потом server group headers при необходимости полного дерева со счётчиками по всему снимку.

---

## Сравнение Focus Pro vs Shugyla

| Ось | Focus Pro (референс владельца) | Shugyla Planning сейчас |
|-----|--------------------------------|-------------------------|
| Иерархия | Non Food → подкатегория → SKU, счётчики | Плоский список SKU; `category / subcategory` — серая строка под названием; фильтры категория/подкатегория в advanced |
| Недели | Отдельные колонки | Одна колонка «Продажи 8 нед.» → `WeeklySpark` (8 пилюль в grid) |
| Заказ | Визуальный акцент / скорость ввода | Колонка «Заказ» = input + история; «Рек.» рядом обычным числом; на mobile рек. в подвале |
| ABC | (не акцент референса) | Три бейджа К/В/П + sort в шапке — занимает заметную ширину до недель |
| Шапка | Период, формула спроса, «к заказу» | Portal-strip: UMAG · syncedAt · N SKU · «N отриц.»; chips незакреплённых/алертов; **period / формула / orderableCount в UI не показаны** |
| Фильтр «к заказу» | Режим референса | Уже есть `orderableOnly` → `final_order_qty > 0` (checkbox в фильтрах) |
| Пагинация | (типично большие срезы / дерево) | Server `range` + `count: exact`, pageSize 25/50/100/500 |
| Mobile | ? | Карточки: ABC + spark + сетка остаток/ср/норма/заказ; без отдельных недельных колонок |

---

## Карта текущей таблицы

### Desktop-колонки (`ProcurementPlannerView.jsx`)

| # | Заголовок | Источник / поле item | Примечание |
|---|-----------|----------------------|------------|
| 1 | № | `(page-1)*pageSize + index` | Не из БД |
| 2 | Товар | `productName`, `barcode`, `categoryName` / `subcategoryName` | Категория не отдельная колонка |
| 3 | ABC | `abcQty`, `abcRevenue`, `abcProfit` | Sort К/В/П |
| 4 | Продажи 8 нед. | `weeklySales` ← `weekly_sales[]` | `WeeklySpark` |
| 5 | Остаток | `rawStock` (+ `negativeStock`) | Отрицательные красным; в расчёте `calculationStock = max(0, raw)` |
| 6 | Ср/день | `avgDaily` | `sum(weekly)/56` на sync |
| 7 | Норма | `normDays` | Read-only; правка во вкладке «Нормы» |
| 8 | Рек. | `recommendedQty` | |
| 9 | Заказ | `finalOrderQty` + override + order history | Editable при правах |
| 10 | Поставщик | `umagSupplierName` | Platform id в фильтрах |

`TABLE_COL_SPAN = 10`. Пагинация: `TablePagination` (desktop + mobile), недавно soft keep-previous при page/pageSize.

### Mobile

Карточка: имя + barcode → ABC → WeeklySpark → остаток / ср/день / норма / заказ → футер поставщик + «рек. N». Отдельных колонок недель нет; категория на mobile **не показывается** в карточке (только desktop под товаром).

### Компоненты

| Часть | Где |
|-------|-----|
| Экран | `src/components/procurement/ProcurementPlannerView.jsx` |
| Стили | `ProcurementPlannerView.css` (`.proc-planner__weeks`, table, qty) |
| Пилюли недель | локальный `WeeklySpark` |
| ABC | `AbcBadges` / `procurementAbc.js` |
| Fetch | `fetchSnapshotItemsPage` → `procurementPlanningService.js` |
| Фильтры/агрегаты UI | `filterOptions` из scan snapshot items (`categories`, `categorySubcategories`, suppliers, unassigned…) |
| Нормы-дерево (референс UX внутри продукта) | `ProcurementNormsView` — accordion category → subcategory, **без SKU** |

---

## Карта данных (item → UI / что уже есть)

### Snapshot (`procurement_snapshots` → `normalizeSnapshot`)

| Поле | Есть? | В UI Planning |
|------|-------|---------------|
| `period_from` / `period_to` | да | Только в meta экспорта PDF/XLSX; **не в шапке** |
| `item_count` | да | Headline «N SKU» |
| `negative_stock_count` | да | Warn «N отриц.» |
| `orderable_count` | да (на снимке) | **Не выведено** в headline |
| `synced_at`, `status` | да | Headline |

Формула на sync (`umag-procurement`):  
`avg_daily = sum(weekly_sales)/56`,  
`recommended = max(0, round(avg_daily * norm_days - calculation_stock))`,  
8 окон: index **0 = oldest, 7 = newest** (`buildEightWeekRanges`).

### Item (`procurement_snapshot_items` → `normalizeItem`)

| Поле | Тип / смысл | UI |
|------|-------------|-----|
| `category_id` | text (UMAG id) | Не показывается; **не path** |
| `category_name`, `subcategory_name` | 2 уровня таксономии | Desktop подпись; фильтры; default ORDER BY |
| Глубже 2 уровней | нет | — |
| `weekly_sales` | `numeric[]`, обычно 8 | Пилюли в одной колонке |
| `sales_8w` | сумма | Не отдельная колонка (есть в данных) |
| `raw_stock`, `calculation_stock`, `negative_stock` | остаток | Показывается raw |
| `avg_daily`, `norm_days`, `recommended_qty`, `final_order_qty` | расчёт / заказ | Колонки |
| ABC + money 8w | классы / revenue/cogs/profit | Бейджи; money в таблице не колонки |
| Поставщик | umag + platform | Имя + filter |

Индексы уже есть: `(snapshot_id, category_name)`, subcategory, supplier, `final_order_qty`, negative partial.

### Filter options (клиентский full scan лёгких колонок)

Уже агрегируют: список `categories`, пары `categorySubcategories`, suppliers с `orderablePositions` / pending, `unassignedOrderableCount`.  
**Нет** готовых счётчиков «SKU в категории X по текущему фильтру поставщика» отдельным RPC — для дерева со счётчиками либо переиспользовать/расширить scan, либо SQL `group by`.

---

## Недели: почему склейка и что нужно для колонок

**Почему одна колонка:** сознательный compact UX — `WeeklySpark` рисует 8 `<span>` в CSS grid (`minmax(1.6rem)`, ~150px), title = склейка чисел. Данные уже разложены по индексам; API менять не нужно.

**Для отдельных колонок (desktop):**

- 8 `<th>` (короткие ярлыки: даты периода или «W-7…W» / «стар→нов»); sticky thead уже желателен при горизонтальном скролле.
- Таблица станет шире: `overflow-x: auto` на wrap уже есть — ок; риск — «товар + ABC + 8 недель + остаток…» уедет за viewport на 13–15" без sticky первых колонок (№ / Товар / Заказ).
- Mobile: **не** копировать 8 колонок в карточки; оставить spark или «последние 2–3 + total» / раскрытие — вопрос владельцу.

Оценка: **высокий value / низкий–средний risk**, чисто фронт (+ optionally подписи недель из `period_from`).

---

## Шапка формулы / сводка

| Нужно «как Focus» | Уже в данных | Дыра |
|-------------------|--------------|------|
| Период продаж | `snapshot.periodFrom` / `periodTo` | Не рендерится |
| Формула | Константы + поля в math (`PLANNING_SALES_DAYS=56`, norm, stock) | Нет одной строки «Ср/день = Σ8нед/56; Рек = …» |
| К заказу (count) | `snapshot.orderableCount`; per-supplier в filterOptions | Snapshot count не в UI; глобальный chip «к заказу» нет (есть checkbox filter) |
| SKU / отриц. | есть | уже в headline |

Минимальная шапка без копирования Focus:  
`Период DD.MM–DD.MM · формула одной строкой · к заказу: N (snapshot или по выбранному поставщику)`.

---

## Где теряются акценты Рек. / Заказ

1. Порядок колонок: ABC и 8 пилюль **слева** от остатка/рек/заказа — глаз сначала на классификацию и историю продаж.  
2. «Рек.» и «Заказ» одинаковым кеглем; заказ не выделен (кроме input border).  
3. Mobile: заказ в grid, рек. мелко в foot — ещё слабее.  
4. Нет колонки «скорость» / days-of-cover; есть косвенно через ср/день и норму.

Быстрые UX без дерева: sticky «Заказ», жирнее input, приглушить ABC (или свернуть в одну колонку/popover), уменьшить/перенести spark.

---

## Блокеры дерева категорий

| Блокер | Суть |
|--------|------|
| **Flat pagination** | `fetchSnapshotItemsPage` = PostgREST `.range(from,to)` по отсортированным **SKU-строкам**. Group header «Non Food (120)» не входит в `totalCount` и не режется страницами осмысленно. |
| Page size 25…500 | При 25 дерево на странице почти всегда обрезает категорию посередине. При 500 + узкий supplier filter — клиентская группировка страницы терпимее, но не глобальная. |
| Поиск / supplier / ABC sort | Любой sort ≠ category ломает смежность групп; ABC sort уже уводит от дерева. |
| Qty edit | Редактирование только на SKU-row; headers должны быть non-editable; keep-previous soft-fetch ок, если headers — derived от `items`. |
| Счётчики | Полные counts по cat/sub при активных фильтрах ≠ просто `filterOptions.categories.length`; нужен aggregate под тот же filter predicate. |
| Depth | Только 2 уровня (+ SKU); Focus «Non Food → …» укладывается в cat/sub. |
| Уже близко | Default sort = category, subcategory, product_name — **смежные SKU одной группы**; Norms UI уже умеет accordion без библиотек. |

### Варианты UX/архитектуры (без новых UI-lib)

**A) Клиентское дерево только в пределах загруженной страницы**  
При рендере вставлять `<tr class="group">` при смене `categoryName` / `subcategoryName`. Счётчик = число строк **на этой странице** (или «…» если группа режется краем).  
+ дёшево, чисто CSS (`ProcurementNorms`-like chevron optional).  
− слабо для «как Excel / Focus»; обманчивые счётчики; поиск/ABC sort отключают смысл.

**B) Серверная выдача group headers + items**  
RPC/view: страницы смешанного потока `{type:header|item, …}` или keyset по `(category, subcategory, product)` + отдельный `group by` counts.  
+ честное дерево и total.  
− новый контракт, сложная пагинация, verify, риск регрессий generate/save; **не минимальный** первый шаг.

**C) Dual mode: «Плоский» / «По категориям»** (рекомендуемый MVP)  
- Режим «Плоский» — как сейчас.  
- Режим «По категориям»: сначала список категорий (из `filterOptions` + counts через лёгкий aggregate или scan), клик → `filters.categoryName` + плоский SKU list (API уже есть); опционально второй уровень subcategory accordion перед SKU.  
+ использует существующие фильтры/индексы; не ломает page/qty/keep-previous; визуал как Norms.  
− не одна бесконечная Excel-таблица со всеми раскрытыми ветками; зато честные counts на уровне навигации.

**Минимальный жизнеспособный путь для Postgres/snapshot:**  
1) не трогать item schema;  
2) внедрить **C** (навигация + существующий `eq category_name`);  
3) опционально усилить A внутри страницы как «visual grouping» только когда sort = default category;  
4) B — только если владелец настаивает на Focus-like continuous tree после C.

Загрузка всех ~10k SKU на клиент для полного дерева — **отклонить** (память, qty save, мобилки смены).

---

## Рекомендуемый порядок внедрения (этапы, без кода)

| Этап | Содержание | Ценность | Риск | Зависимости |
|------|------------|----------|------|-------------|
| **P0** | Desktop: 8 недельных колонок (или hybrid: 4 последних + «Σ»); sticky Товар/Заказ; mobile — упрощённый spark | Высокая читаемость тренда | Средний (ширина таблицы) | Нет API |
| **P1** | Акценты: Заказ визуально главный; ABC компактнее; шапка: период + краткая формула + «к заказу N» | Смысл «что заказывать» | Низкий | Поля snapshot уже есть |
| **P2** | Dual mode «По категориям» (C) + опциональные page group headers при default sort (A light) | Иерархия без лжи счётчиков | Средний (UX режимов, verify) | filterOptions / category filter |
| **P3** | Server group-by / mixed page (B) — только по итогам P2 | Полный Focus-paritet | Высокий | Новый RPC + пагинация |

Параллельно не смешивать с keep-previous / HR / snapshot-guard PR.

Предпочтительная серия PR: **недели → акценты+шапка → дерево (C)**; один большой PR нежелателен.

---

## Вопросы владельцу (этап 2 — решения)

1. **Дерево обязательно в v1** улучшений информативности, или сначала недели + акценты/шапка, дерево следом?  
2. **Mobile:** те же 8 недельных колонок (горизонтальный скролл) или упрощённый вид (spark / последние недели)?  
3. **ABC:** оставляем рядом с неделями как сейчас, или компактнее (одна колонка / в фильтры / вторичный ряд)?  
4. **Шапка формулы:** нужна точная копия Focus Pro или наша краткая строка (период · формула · к заказу)?  
5. Режим **«только к заказу»** как у Focus — нужен заметный toggle/chip (сейчас checkbox в advanced), или текущего фильтра достаточно?  
6. Доставка: **один большой PR** или серия **недели → акценты/шапка → дерево**?

---

## Доказательные якоря (для этапа 2)

- Колонки / `WeeklySpark` / category under product: `ProcurementPlannerView.jsx` (thead + `WeeklySpark`).  
- Нормализация item/snapshot: `procurementPlanningService.js` `normalizeItem` / `normalizeSnapshot`.  
- Default sort category→sub→name: `describeSnapshotItemsAbcQuery` в `procurementAbc.js`.  
- 8 недель oldest→newest + формула: `supabase/functions/umag-procurement/index.ts` (`buildEightWeekRanges`, `calcRecommendedQty`).  
- Schema cat/sub + `weekly_sales[]`: `20260809072915_procurement_planning_v1.sql`.  
- Accordion-прецедент: `ProcurementNormsView.jsx`.
