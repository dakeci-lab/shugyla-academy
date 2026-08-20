# План: compact UX Planning + дерево в таблице

**Статус:** PR A реализован. PR B реализован (verify зелёный; коммит/PR — по команде владельца).  
**Дата:** 2026-08-21.  
**Опора:** `docs/procurement/audit-planner-tree-compact-ux.md`  
**Формат:** два узких PR — **A** compact cleanup → **B** in-table tree (вариант B аудита). Без P3 server mixed-stream, без page-cache.

Решения владельца:

| # | Тема | Решение |
|---|------|---------|
| 1 | Cleanup | Убрать ABC-легенду → «?» hover у th ABC; sense-line; browse switch; cat-nav/crumbs; subtitle cat/sub под SKU |
| 2 | Оставить | UMAG/SKU/отриц. strip; chip «Только к заказу»; week columns / sticky / accents Заказ |
| 3 | Дерево | MVP = **B**: свёрнутые category(/sub) из `filterOptions` + «+» lazy-expand → `fetchSnapshotItemsPage`. Не грузить ~10k |
| 4 | Counts | На группах показывать count **«по снимку»** |
| 5 | Поиск / ABC sort | Временный **плоский** SKU-режим |
| 6 | Доставка | Два PR: A затем B |
| 7 | Пагинация | Global 25/100/500 на весь снимок **не критична**; корень без global paginator; в ветке — per-branch page / «Ещё» / больший default. Не P3 |
| 8 | Стек | Без page-cache, без новых UI-lib |

Противоречий аудиту нет: владелец утвердил рекомендуемый MVP B и серию A→B.

---

## Цель и non-goals

### Цель

Убрать шум P1/P2 (sense-line, dual-mode, отдельный cat-nav, длинная ABC-легенда, дубль категории под SKU) и дать в основной таблице Planning иерархию как у Focus Pro: категории свёрнуты, «+» раскрывает подкатегории/SKU через уже существующий page-fetch — без выгрузки всего снимка.

### Non-goals

- Server mixed headers+items / старый P3 RPC
- Загрузка всех ~10k SKU на клиент / page-cache SKU
- Возврат sense-line или dual-mode «Плоский | По категориям»
- Fake counts = `items.length` текущей page как «полный» count категории
- Новые UI-библиотеки / Tailwind
- Edge / SQL schema / keep-previous рефакторинг как отдельная тема (keep-previous на leaf-fetch сохранить поведением, не ломать)
- Pixel-копия Focus Pro

### Принципы

1. Один PR = один этап (A cleanup, B tree).  
2. Данные для корня дерева уже в `filterOptions` (`categoryCounts` / `pairCounts`).  
3. Counts всегда подписаны смыслом «по снимку».  
4. Чистый CSS; иконка «?» — inline SVG или существующие `PlatformIcons`, без новых deps.

---

## PR A — Compact cleanup

**Статус этапа:** реализация сделана, готово к ревью.  
**Verify:** `npm run verify:procurement-planner-header`, `npm run verify:procurement-planner-categories` (bridge до PR B).

**Ветка (рекомендация):** `cursor/planner-compact-cleanup`  
**Зависимости:** нет (поверх текущего Planning с P0–P2).  
**После A:** таблица снова **только плоский SKU** (без dual-mode, без A-light group headers — убрать вместе с P2-навигацией, чтобы не путать с будущим деревом).

### Чеклист удалений / замен

| # | Действие | Деталь |
|---|----------|--------|
| 1 | Убрать `.proc-planner__abc-legend` | Весь блок над таблицей |
| 2 | Добавить «?» у `<th>ABC` | Hover/`title` (и CSS tooltip при необходимости) с тем же смыслом: A≤80%, B≤95%, C остальное, — нет данных; К/В/П |
| 3 | Убрать sense-line | `.proc-planner__sense`, вызов `buildPlannerSenseLine` из `headerStrip` |
| 4 | Оставить UMAG strip | `.proc-planner__snapshot` + alert chips без изменений контракта |
| 5 | Убрать browse switch | `.proc-planner__browse-mode`, state `browseMode`, `handleBrowseModeChange` |
| 6 | Убрать crumbs + cat-nav | `.proc-planner__crumbs`, `.proc-planner__cat-nav`, openCategoryNav / breadcrumb handlers, early-return в `loadItems` по browse level |
| 7 | Убрать subtitle cat/sub | `.proc-planner__cat` под `productName` (desktop; mobile — если дубль есть) |
| 8 | Убрать A-light group rows | `groupHeadersEnabled` / `buildPlannerSkuTableRows` в рендере A (хелпер можно оставить до B или вычистить в A — предпочтение: **не рендерить** в A; удаление хелпера допустимо в B) |
| 9 | Оставить | chip «Только к заказу»; weeks/sticky; accents Заказ / muted Рек. / compact ABC badges |
| 10 | Sense helper | Удалить из UI; `buildPlannerSenseLine` / константы формулы — удалить в A **или** оставить dead до чистки verify (предпочтение: удалить unused + поправить verify в том же PR) |

Advanced filters category/subcategory **можно оставить** как узкий фильтр плоского списка (не drill-down UI).

### Файлы (ожидаемые)

| Файл | Что |
|------|-----|
| `src/components/procurement/ProcurementPlannerView.jsx` | удаления + «?» у ABC; плоский `loadItems` без browse |
| `src/components/procurement/ProcurementPlannerView.css` | убрать sense/browse/cat-nav/legend/group-row если не нужны; стили «?» |
| `src/utils/procurementPlannerUx.js` | удалить/сузить sense-line; dual-mode nav helpers, не нужные после A (или пометить и снести в B) |
| `scripts/verify-procurement-planner-header.mjs` | без sense asserts; assert «?» / нет legend; chip + accents остаются |
| `scripts/verify-procurement-planner-categories.mjs` | временно ослабить/пометить obsolete **или** заменить минимальным «нет browse-mode / нет cat-nav» до PR B |
| `scripts/verify-procurement-abc-analysis.mjs` | legend → tooltip у th |
| `package.json` | только если меняются имена scripts |
| `docs/procurement/plan-planner-tree-compact-ux.md` | статус A |

### Verify + приёмка A

```bash
npm run verify:procurement-planner-header   # обновлённый
npm run verify:procurement-planner-weeks
npm run verify:procurement-pagination-ux
npm run verify:procurement-desktop-ux
# abc-analysis — если затронут legend assert
```

**Ручные:**

1. Нет sense-line; UMAG · SKU · отриц. на месте.  
2. Нет «Плоский | По категориям», нет списка «Все категории».  
3. Нет длинной ABC-легенды; у th ABC «?» с понятным hover.  
4. Под SKU нет серой `category / subcategory`.  
5. Chip «Только к заказу», недели, sticky, заказ-акцент работают.  
6. Плоский список SKU + пагинация как до dual-mode leaf.

---

## PR B — In-table tree (вариант B)

**Статус этапа:** реализация сделана, готово к ревью.  
**Verify:** `npm run verify:procurement-planner-tree` (alias `verify:procurement-planner-categories`).  
**Пагинация ветки:** кнопка **«Ещё»** (pageSize 50), не мини-paginator.

**Ветка:** `cursor/planner-in-table-tree`  
**База:** A в `main` (или поверх A).  
**Модель:** collapsed group rows из `filterOptions` + lazy expand → `fetchSnapshotItemsPage`.

### UX дерева

**Корень (default, нет поиска / нет ABC sort):**

- `tbody` состоит из строк категорий (из `buildPlannerCategoryNavModel` / `filterOptions`).  
- Каждая свёрнута: имя + count «по снимку» + кнопка **«+»** (`aria-expanded=false`).  
- Global `TablePagination` на весь снимок **не показывать** на корне (владелец: не критично).

**Expand категории («+» → «−»):**

- Sub ≤ 1 → сразу загрузить SKU (`categoryName` + optional `subcategoryName`), показать SKU-строки под группой.  
- Sub > 1 → вставить свёрнутые строки подкатегорий (pairCounts), без SKU-fetch.  

**Expand подкатегории:** fetch SKU с обоими фильтрами + активные toolbar filters (supplier, orderableOnly; search — см. fallback).

**SKU-строки:** без subtitle cat/sub; weeks / ABC badges / заказ как после A.

**Collapse «−»:** можно размонтировать children и сбросить branch cache (проще) или держать в памяти до смены snapshot/supplier — на усмотрение; предпочтение MVP: **сброс children при collapse** (меньше утечек state).

### State (ориентир)

| State | Смысл |
|-------|--------|
| `expandedKeys` | `Set` ключей `cat` / `cat\0sub` |
| `branchItems[key]` | `{ items, totalCount, page, pageSize, loading, requestId }` |
| `viewMode` derived | `tree` если `!debouncedSearch.trim() && !abcSort.field`; иначе `flat` |

Корневой `items`/`page` глобального плоского списка в tree-режиме не использовать (или не fetch'ить). В `flat`-режиме — текущий `loadItems` как после A.

Request id / ignore stale — на **каждую ветку** (как planner itemsRequestId, локально).

### Pagination policy (упрощённая)

| Уровень | Политика |
|---------|----------|
| Корень (категории) | Без global paginator; весь список категорий из filterOptions |
| SKU в ветке | Per-branch: либо компактный paginator (pageSize default **50** или 100 — зафиксировать в реализации), либо первая страница + кнопка **«Ещё»** до `totalCount`. Предпочтение плана: **«Ещё»** (меньше chrome) **или** мини-paginator в футере ветки — один вариант на весь PR B |
| Смена supplier / orderable / sync | Сбросить `expandedKeys` + `branchItems` |

Не делать server mixed P3. Не делать page-cache соседних веток.

### Search / ABC flat fallback

| Условие | UI |
|---------|-----|
| Непустой debounced search | Плоский SKU-список + обычная пагинация (global); дерево скрыто |
| Активный `abcSort.field` | То же — плоский список |
| Сброс search и ABC sort | Вернуться к дереву (collapsed default) |

Подпись/hint опциональна: «Поиск / сортировка ABC — плоский список».

### Counts

- Показывать число из `categoryCounts` / `pairCounts`.  
- Подпись/title: **«по снимку»** (и при активном поставщике/orderable — та же честная оговорка в `title`, без пересчёта в MVP).

### Файлы (ожидаемые)

| Файл | Что |
|------|-----|
| `ProcurementPlannerView.jsx` | tree render, expand/fetch, flat fallback |
| `ProcurementPlannerView.css` | tree row, +/−, indent, branch «Ещё» |
| `procurementPlannerUx.js` | tree row builders; переиспользовать nav model / counts; убрать obsolete dual-mode list API если ещё жив |
| `scripts/verify-procurement-planner-categories.mjs` → **заменить** на tree asserts (или `verify-procurement-planner-tree.mjs` + package.json) | expand/lazy fetch markers; нет browse-mode; counts не page length; flat fallback search/ABC |
| `verify:procurement-planner-header` / weeks / pagination | регресс |
| этот plan-док | статус B |

### Verify + приёмка B

**Asserts (идея):**

1. Нет `proc-planner__browse-mode` / cat-nav.  
2. Есть tree group row + expand control.  
3. Expand связан с `fetchSnapshotItemsPage` / category filters (не full-table select без range).  
4. Counts / «по снимку» в UI или helper.  
5. Search или ABC sort → flat path (маркер в коде).  
6. Нет `.proc-planner__cat` subtitle на SKU.  
7. P0/P1 маркеры: weeks, sticky, order accent, orderable chip, UMAG strip.

**Ручные:**

1. Cold: только свёрнутые категории + counts.  
2. «+» cat → sub или SKU; «+» sub → SKU; qty edit ок.  
3. «−» сворачивает.  
4. Поиск по штрихкоду → плоский список; очистка → дерево.  
5. ABC sort → плоский; сброс sort → дерево.  
6. Поставщик / «только к заказу»: expand отдаёт отфильтрованные SKU; count на группе по-прежнему «по снимку».  
7. Mobile: дерево usable (group rows + карточки SKU при expand) или упрощённый тот же expand; без 8 week-колонок.

---

## Порядок выкладки

```text
PR A (compact cleanup) → verify зелёный → ревью → merge/прод по команде
    → PR B (in-table tree) → verify зелёный → ревью → merge/прод
```

- Коммит/push/PR — только по явной команде владельца на каждый этап.  
- Не смешивать A и B в одном PR.  
- Не начинать page-cache / P3.

Ориентир сообщений:

```text
fix(procurement): compact planner header and drop dual-mode nav
feat(procurement): in-table category tree with lazy expand
```

---

## Закрытые решения владельца (кратко)

1. Legend → «?» у ABC; sense / browse / cat-nav / SKU cat-subtitle — **убрать**.  
2. UMAG strip + «Только к заказу» + weeks/sticky/accents — **оставить**.  
3. Дерево = **B** (filterOptions + lazy fetch), не 10k client load, не P3.  
4. Counts на группах — **да, «по снимку»**.  
5. Поиск и ABC sort — **плоский fallback**.  
6. Два PR: **A → B**.  
7. Пагинация снимка целиком не критична; в дереве — упрощённая (корень без global pager; ветка — per-branch / «Ещё»).

---

## Preflight исполнителя

1. Прочитать этот план + аудит.  
2. Дифф только по файлам этапа.  
3. Прогнать verify этапа + регресс weeks/header/pagination/desktop.  
4. Не коммитить, пока владелец не попросит.
