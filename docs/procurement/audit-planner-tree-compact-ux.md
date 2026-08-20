# Аудит — compact UX Planning + дерево в таблице (вместо dual-mode)

**Направление:** только аудит (без правок кода, без коммитов).  
**Дата:** 2026-08-21.  
**Кейс:** после P0–P2 владелец хочет убрать шум (ABC-легенда, sense-line, dual-mode «Плоский|По категориям», отдельный cat-nav) и заменить иерархию на **дерево в таблице как Focus Pro** (свёрнуто по умолчанию, «+» раскрывает), плюс убрать дубль `category/sub` под SKU.  
**Опора:** `docs/procurement/audit-planner-table-informativeness.md`, `docs/procurement/plan-planner-table-informativeness.md` (P0–P2).

**Вне скоупа:** page-cache страниц SKU, P3 server mixed-stream pagination, Edge/SQL schema, HR, snapshot-guard, новые UI-библиотеки.

---

## Вердикт

Текущий P2 (dual-mode C + отдельный список категорий) **не совпадает** с целевым UX Focus Pro: иерархия вынесена из таблицы в отдельную навигацию, а в плоском режиме A-light headers — лишь подписи на уже загруженной странице SKU, без collapse/expand. Нужные чистки (легенда → «?» у ABC, снос sense-line, снос browse switch + cat-nav, снос subtitle категории под товаром) — **локальный фронт**. Жизспособное дерево **без** загрузки ~10k SKU: **корневой список категорий (и подкатегорий) из уже существующего `filterOptions` + lazy expand → тот же `fetchSnapshotItemsPage` с `categoryName`/`subcategoryName`**. Это развитие P2-данных и A-light UI, а не возврат к «всё в память». Dual-mode и drill-down list удаляются; пагинация на корне — по **группам** (дешёво), на листьях — привычный page/pageSize по SKU внутри раскрытой ветки (или одна «страница» на expand + «ещё»).

---

## Карта текущего UI (что где)

| Элемент | Где | Статус относительно заказа |
|---------|-----|----------------------------|
| Sense-line «Период · формула · К заказу N» | `headerStrip` → `.proc-planner__sense`; `buildPlannerSenseLine` | **Убрать** |
| UMAG strip | рядом: `.proc-planner__snapshot` = `buildSnapshotHeadline` (`syncedAt · N SKU`, warn «N отриц.») | **Не в приказе удалять** — вопрос владельцу |
| Alert chips | `getPlannerAlertChips` (незакреплённые / inconsistent…) в том же topbar | Тоже не в приказе — обычно оставить с UMAG |
| Chip «Только к заказу» | toolbar `.proc-planner__orderable-toggle` → `filters.orderableOnly` | Вопрос владельцу |
| Browse switch | `.proc-planner__browse-mode` «Плоский \| По категориям» | **Убрать** |
| Cat-nav + crumbs | `.proc-planner__crumbs`, `.proc-planner__cat-nav` | **Убрать** |
| ABC legend | блок `.proc-planner__abc-legend` над таблицей | **Убрать**; перенести смысл в tooltip «?» у `<th>ABC` |
| A-light group headers | `buildPlannerSkuTableRows` + `.proc-planner__group-row` при default sort | **Эволюционировать** в collapse/expand tree rows, не оставлять как сейчас |
| Subtitle cat/sub под SKU | `.proc-planner__cat` в ячейке товара (desktop) | **Убрать** |
| Mobile spark / week columns | P0: desktop 8 col, mobile `WeeklySpark` | Сохранить |
| Акцент Заказ / compact ABC badges | P1 | Сохранить (кроме legend) |

### State / fetch (сейчас)

| State | Роль |
|-------|------|
| `browseMode` `flat` \| `categories` | dual-mode; при categories без leaf — `loadItems` early-return, пустые items |
| `filters.categoryName` / `subcategoryName` | и advanced filter, и drill-down C |
| `items` + `page`/`pageSize`/`totalCount` | `fetchSnapshotItemsPage` + keep-previous soft/hard |
| `filterOptions.categories`, `categorySubcategories`, **`categoryCounts` / `pairCounts`** | scan снимка; честные counts «по снимку» |
| `abcSort` | выключает A-light headers |
| `debouncedSearch` | тоже выключает A-light |

Корневой список категорий **уже не требует** SKU-fetch — данные в `filterOptions` после scan/SWR.

---

## Чеклист правок

### Убрать

1. Рендер `.proc-planner__abc-legend` (+ связанные CSS).  
2. Sense-line: JSX `.proc-planner__sense`, вызов `buildPlannerSenseLine` в strip (хелпер можно оставить unused→удалить или сузить verify).  
3. `browseMode` + UI `.proc-planner__browse-mode` + `handleBrowseModeChange` / early-return в `loadItems` по browse.  
4. Crumbs + `.proc-planner__cat-nav` / списки cat-item.  
5. Desktop (и mobile, если есть) строка `.proc-planner__cat` под названием SKU.  
6. Dual-mode-only UX helpers, которые больше не нужны как «навигатор» (часть `resolvePlannerCategoryBrowseLevel` для list-mode) — либо переиспользовать под tree expand.

### Добавить / заменить

1. У заголовка **ABC**: компактная иконка «?» + `title`/CSS hover-tooltip с текстом легенды (A/B/C пороги, К/В/П). Клик не обязателен; a11y: `button` или `<span role="img" tabindex="0" title=…>`.  
2. **Дерево в `tbody`**: строки группы (category → subcategory) свёрнуты по умолчанию; контрол «+» / «−»; раскрытие подгружает детей.  
3. SKU-строки без дубля категории в subtitle.  
4. Обновить verify (см. ниже).

### Сохранить из P0/P1/P2

| Сохранить | Зачем |
|-----------|--------|
| 8 week columns + sticky + mobile spark | P0 |
| Акцент колонки Заказ, muted Рек., compact ABC badges/sort | P1 без sense-line |
| `categoryCounts` / `pairCounts` в filter scan + cache v2 | counts для свёрнутых групп |
| `fetchSnapshotItemsPage` + filters + keep-previous | leaf fetch |
| Chip orderable / UMAG strip | по ответам владельца |

---

## Модели дерева (2–3 варианта)

### A) Page A-light → collapsed headers only on current SKU page (слабо)

Развитие сегодняшнего `buildPlannerSkuTableRows`: headers + кнопка, но дети = уже лежащие в `items` строки страницы.

- Плюсы: дёшево.  
- Минусы: **не Focus**: без expand нет SKU вне текущей page; свёртка «пустых» групп бессмысленна; counts по page = ложь.  
- **Не рекомендовать** как целевой MVP.

### B) MVP — Group rows из `filterOptions` + lazy expand fetch (рекомендуется)

**Корневой вид таблицы (default):**

1. Строки категорий из `buildPlannerCategoryNavModel(filterOptions)` (уже есть), **все свёрнуты**, «+».  
2. Опционально count «по снимку» (как P2) — вопрос владельцу.  
3. Клик «+» на категории:  
   - если sub ≤ 1 → сразу fetch SKU (`categoryName` + optional `subcategoryName`) и вставить child rows;  
   - если sub > 1 → показать child rows подкатегорий (из `categorySubcategories` / pairCounts), тоже свёрнутые.  
4. Клик «+» на подкатегории → `fetchSnapshotItemsPage` с обоими фильтрами (+ активные supplier / orderable / search — см. поиск).  
5. Qty edit / keep-previous работают на SKU-строках как сейчас.  
6. **Не** грузить весь snapshot; в памяти только expanded branches (+ их текущая page SKU).

**Пагинация:**

| Уровень | Как |
|---------|-----|
| Категории на корне | Клиентский список из filterOptions (обычно ≪ 10k). При очень большом числе категорий — позже virtualize; не блокер MVP. |
| SKU под раскрытой веткой | Тот же `page`/`pageSize` **в контексте ветки** (локальный page state per expanded key) **или** одна загрузка `pageSize` + «Показать ещё». Предпочтение MVP: per-branch `page` + `TablePagination` под раскрытым блоком / в футере ветки. |
| Глобальный paginator на корне | Скрыть или заменить на «N категорий», пока нет плоского SKU-режима. |

**Поиск / ABC sort / поставщик / orderable:**

| Триггер | Поведение MVP |
|---------|----------------|
| Поиск (штрихкод/имя) | **Выход в плоский SKU-список** (как сейчас fetch без tree), без ложного «искать только в раскрытых». Вопрос владельцу подтверждает. |
| ABC sort активен | Плоский SKU-список (дерево выкл.) — иначе sort ломает иерархию. |
| Поставщик / «только к заказу» | Expand-fetch уже фильтрует; **counts на свёрнутых** остаются snapshot-wide → подпись «по снимку» или скрыть count (как в P2). |
| Keep-previous | На leaf-fetch ветки — тот же soft/hard scope key, scope = filters+page ветки. |

**Связь с A-light:** визуальный класс group-row + label helper переиспользовать; семантика меняется с «разделитель на странице SKU» на «узел дерева».

### C) Server mixed page (headers+items) / P3

Один PostgREST/RPC поток с group headers в `range` — честный continuous Excel-scroll.

- Плюсы: ближе к Focus на огромных списках.  
- Минусы: новый контракт, высокий риск, ранее **осознанно отложен**.  
- Только если B мало после выкладки.

---

## Рекомендуемый MVP дерева (одна модель)

**B: таблица = collapsed category(/sub) rows из `filterOptions` + «+» lazy-expand через существующий `fetchSnapshotItemsPage`; поиск и ABC sort временно переключают в плоский SKU-режим; 10k целиком не грузить.**

### Non-goals MVP

- Загрузка всех SKU на клиент / virtual scroll всего снимка.  
- Server mixed pagination (вариант C / старый P3).  
- Page-cache соседних SKU pages.  
- Pixel-копия Focus Pro.  
- Dual-mode switch и отдельный cat-nav (удаляются).  
- Возврат sense-line.

---

## Порядок внедрения (1–2 PR)

**Рекомендация:** два узких PR (меньше риска регресса P0/пагинации).

| PR | Содержание |
|----|------------|
| **A — Compact cleanup** | Убрать legend (→ «?» tooltip у ABC th); убрать sense-line; убрать browse switch + crumbs + cat-nav + `browseMode` ветки; убрать `.proc-planner__cat` subtitle; вычистить мёртвый CSS; поправить verify (header/categories/abc legend). Таблица остаётся **плоским SKU** (+ временно можно оставить/убрать A-light — лучше убрать вместе с dual-mode, чтобы не путать). |
| **B — In-table tree** | Collapsed group rows + expand/collapse state; lazy fetch; pagination per branch или «ещё»; поиск/ABC → flat fallback; counts policy; новый/замена `verify:procurement-planner-categories` → tree verify. |

Один большой PR допустим, если владелец хочет быстрее один проход — выше конфликт с verify и сложнее ревью.

---

## Влияние на verify

| Script | Ожидание |
|--------|----------|
| `verify:procurement-planner-weeks` | Почти без изменений (недели / sticky). |
| `verify:procurement-planner-header` | Сейчас требует sense-line → **переписать**: sense asserts снять; оставить orderable chip / accents / compact ABC **если** chip остаётся; добавить assert «?» у ABC / нет `abc-legend`. |
| `verify:procurement-planner-categories` | Сейчас dual-mode C → **заменить** на tree: нет browse-mode; есть expand/collapse + lazy filter fetch; counts не из `items.length`. |
| `verify:procurement-abc-analysis` | Asserts на `proc-planner__abc-legend` → перенести на tooltip у th. |
| `verify:procurement-pagination-ux` / `desktop-ux` | Дым; desktop-ux может затронуть filterOptions counts (уже есть) — точечно. |
| `verify:procurement-planning-v1` | Скорее нейтрален. |

---

## Вопросы владельцу (макс. 5)

1. **UMAG / SKU / «N отриц.» strip** (+ alert chips) в topbar рядом с вкладками — **оставить** или тоже урезать/убрать?  
2. Chip **«Только к заказу»** в primary toolbar — **оставить**?  
3. На свёрнутой группе показывать **count «по снимку»** или только имя + «+»?  
4. **Поиск** по штрихкоду/имени в режиме дерева: сразу **плоский SKU-список** (рекомендация аудита) или пытаться искать «внутри раскрытых»?  
5. Доставка: **один PR** на cleanup+дерево или серия **(A) compact cleanup → (B) дерево**?

---

## Доказательные якоря

- Sense + UMAG strip: `ProcurementPlannerView.jsx` `headerStrip` (`.proc-planner__sense`, `.proc-planner__snapshot`).  
- ABC legend: `.proc-planner__abc-legend` в том же файле.  
- Browse + cat-nav: `browseMode`, `.proc-planner__browse-mode`, `.proc-planner__cat-nav`.  
- A-light: `buildPlannerSkuTableRows` / `groupHeadersEnabled`.  
- Subtitle: `.proc-planner__cat` под `productName`.  
- Counts: `categoryCounts` / `pairCounts` в `finalizeSnapshotFilterOptions`.  
- Verify: `verify-procurement-planner-header.mjs`, `verify-procurement-planner-categories.mjs`, `verify-procurement-abc-analysis.mjs` (legend).
