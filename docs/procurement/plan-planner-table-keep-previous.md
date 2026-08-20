# Этап 2 — План: keep-previous для таблицы Planning

**Статус:** реализация сделана (verify + ручная приёмка перед PR).  
**Дата:** 2026-08-20.  
**Опора:** `docs/procurement/audit-planner-table-keep-previous.md`  
**PR:** один узкий — только Planning table loading UX + CSS + verify. Без Stage 3 perf, Edge, SQL, других модулей.

Решения владельца:

| # | Тема | Решение |
|---|------|---------|
| 1 | Cold load (`items` пустые) | Полный «Загрузка…» |
| 2 | Смена поставщика / filters / search / abcSort / snapshot | **Hard clear** `items`, затем загрузка |
| 3 | Soft: page / pageSize (тот же scope) | Keep previous rows; opacity + тонкая полоска сверху |
| 4 | Soft-fetch | Блокировать пагинацию и pageSize |
| 5 | Скоуп | Только Planning; общий хук **не** делать |
| 6 | Быстрые клики | Request generation / ignore stale responses |

Противоречий аудиту нет: аудит предлагал минимальный keep-previous + опциональный hard reset на смене scope и seq/abort — владелец утвердил все три направления без общего хука.

---

## Цель и non-goals

### Цель

При смене страницы или «Строк на странице» в Закупки → Планирование таблица **не** превращается в белую дыру «Загрузка…»: старые строки остаются, лёгкий индикатор фона, после ответа — swap. Cold load и смена scope (поставщик/фильтры/…) ведут себя явно иначе.

### Non-goals

- Общий `useKeepPreviousQuery` / перенос паттерна на Orders / Norms / Receiving
- Stage 3 (coalescing workforce, remount storms, бандл)
- Изменения `fetchSnapshotItemsPage`, Edge, RLS, SQL, индексов
- Кэш страниц в памяти / prefetch соседних page
- ABC / snapshot guard / supplier «Сегодня» / HR clear-shifts
- Виртуальный скролл 9929 SKU

---

## isInitialLoading vs isFetching

Один булев `loading` сегодня смешивает cold и soft. В реализации развести семантику (имена можно чуть упростить, смысл зафиксирован):

| Флаг / выражение | Когда true | UI |
|------------------|------------|-----|
| `isInitialLoading` | идёт fetch **и** нечего показывать (`items.length === 0`) | Полный «Загрузка…» (desktop tbody / mobile empty) |
| `isFetching` | идёт fetch **и** `items.length > 0` (keep-previous) | Rows остаются; wrapper с opacity + top bar; pagination disabled |
| Idle | fetch не идёт | Обычный рендер |

Эквивалент без второго state-флага допустим: `const isFetching = loading && items.length > 0`, `const isInitialLoading = loading && items.length === 0` — **если** hard clear на смене scope обнуляет `items` **до** `setLoading(true)`.

Предпочтение: явный `itemsRequestId` (ref) + `loading` boolean; derived flags для рендера.

---

## Список файлов к изменению (точный)

| Файл | Что |
|------|-----|
| `src/components/procurement/ProcurementPlannerView.jsx` | hard clear на scope change; soft keep-previous render; request gen; передать `disabled` в пагинацию |
| `src/components/procurement/ProcurementPlannerView.css` | `.proc-planner__table-wrap--fetching` (opacity) + тонкая полоска сверху; то же для mobile при необходимости |
| `src/components/procurement/TablePagination.jsx` | prop `disabled` (или `controlsDisabled`): все кнопки page + select pageSize |
| `scripts/verify-procurement-pagination-ux.mjs` | расширить static asserts keep-previous / hard clear / disabled |
| `package.json` | только если заводим **новый** script — предпочтительно **не** заводить, расширить существующий `verify:procurement-pagination-ux` |
| `docs/procurement/plan-planner-table-keep-previous.md` | этот план (статус после реализации) |

**Не входят:** `procurementPlanningService.js`, Edge, другие страницы с `TablePagination` (prop опционален, default `false`).

---

## Поведение по триггерам

| Триггер | Clear items? | Loading UI | Pagination |
|---------|--------------|------------|------------|
| Cold: первый вход / items пустые / нет готового snapshot | уже пусто или `[]` | **isInitialLoading** → «Загрузка…» | можно disabled |
| Soft: `page` / `pageSize` (тот же snapshot + filters + search + abc) | **нет** | **isFetching** → opacity + bar, rows остаются | **disabled** |
| Hard scope: `filters` (вкл. поставщик), `debouncedSearch`, `abcSort`, `snapshot?.id` | **`setItems([])`** (и при необходимости сброс `lastCommittedQtyRef`) **перед** fetch | isInitialLoading | disabled ок |
| Snapshot syncing/failed (как сейчас) | `setItems([])` | пусто / загрузка | — |
| Sync / generate / явный `loadItems` после мутации | если scope тот же и items есть — soft; если полный refresh после generate — допустим soft **или** hard; предпочтение: **soft**, если items ещё релевантны той же странице; после generate обычно нужен refresh текущей страницы → soft keep-previous | soft | disabled |

Сброс `page → 1` при смене search/filters/abc/snapshot **сохранить** (уже есть). Hard clear items делать в том же эффекте или в начале `loadItems`, когда изменился «scope key» (не page/pageSize).

Практичная схема scope key:

```text
scopeKey = `${snapshotId}|${debouncedSearch}|${stableFilters}|${abcSort.field}|${abcSort.dir}`
```

- Если `scopeKey` сменился относительно предыдущего fetch → hard clear + fetch.  
- Если сменились только `page` / `pageSize` → soft fetch.

---

## Stale-response защита

1. `itemsRequestIdRef` (number): инкремент в начале каждого `loadItems`.  
2. Захватить `const requestId = ++itemsRequestIdRef.current` (или pre-increment в local).  
3. После `await fetchSnapshotItemsPage(...)`: если `requestId !== itemsRequestIdRef.current` → **не** вызывать `setItems` / `setTotalCount` / обновление `lastCommittedQtyRef`; в `finally` сбрасывать `loading` только если это всё ещё актуальный (или вести `inflightCount` / «loading = any newer pending» — минимум: `setLoading(false)` только когда `requestId === current`).  
4. AbortController **не обязателен** в v1 (ignore stale достаточно); можно добавить позже.

Риск редактирования qty на «старой» странице во время soft-fetch: при blocked pagination окно меньше; blur/save по id строки — если ответ другой страницы перезапишет items, in-flight edit может потерять контекст. Митигация v1: pagination disabled + ignore stale; не раздувать optimistic lock в этом PR.

---

## UI-детали soft

- Desktop: обертка таблицы (уже есть / добавить) с модификатором `--fetching`: `opacity: ~0.55–0.7`; `::before` или дочерний bar высотой 2px сверху (indeterminate или статичный accent).  
- Mobile cards: тот же модификатор на контейнер списка.  
- Не заменять tbody на «Загрузка…», пока `items.length > 0`.  
- Номера строк `{(page - 1) * pageSize + index + 1}` во время soft-fetch могут **не совпадать** с ещё старыми items (page уже новый, items старые) — краткий рассинхрон. Допустимо в v1 **или** показывать старые номера до swap; зафиксировать в реализации: **оставить формулу от текущего `page`** (пагинатор уже на новой странице) — визуально на долю секунды номера «врут»; альтернатива — заморозить displayedPage до ответа. Предпочтение плана: **заморозить отображаемый page range в пагинации до ответа** сложно; проще disabled controls + быстрый swap. Номера строк: считать от **pre-fetch page** через ref `displayedPageRef` обновляемый только при успешном apply — опционально. **Минимум v1:** disabled pagination + keep rows + opacity; номера могут мигать — приемлемо если fetch быстрый.

Решение для v1 (зафиксировать): номера строк и `from–to` в TablePagination остаются от текущего `page`/`totalCount` state; при soft краткий рассинхрон ок. Не усложнять freeze page в первом PR.

---

## Verify

Расширить **`scripts/verify-procurement-pagination-ux.mjs`** (`npm run verify:procurement-pagination-ux`), не новый script.

Static asserts (идея):

1. Planner не рендерит «Загрузка…» единственной веткой `loading ?` без учёта items — есть ветка keep-previous / `isFetching` / `items.length > 0`.  
2. Есть `itemsRequestId` / `requestId` (или аналог) и проверка перед `setItems`.  
3. Hard clear: `setItems([])` связан со сменой scope (не только snapshot syncing) — напр. присутствует scopeKey / clear при filters/search/abc.  
4. `TablePagination` принимает `disabled` (или `controlsDisabled`) и planner передаёт его при fetching.  
5. CSS: класс fetching / opacity / bar в `ProcurementPlannerView.css`.  
6. Регресс: page sizes 25/50/100/500 и прочие существующие asserts файла остаются.

---

## Критерии приёмки

### Verify

```bash
npm run verify:procurement-pagination-ux
```

### Ручные

1. Cold: открыть Planning без кэша строк → полный «Загрузка…», затем таблица.  
2. Page flip / pageSize: таблица **не** пустеет; лёгкая opacity + полоска; после ответа — новые строки.  
3. Во время soft-fetch кнопки страниц и select размера **недоступны**.  
4. Смена поставщика (или другого фильтра): таблица очищается / «Загрузка…», не чужие SKU предыдущего поставщика.  
5. Быстрые клики next→next: финальный экран = последняя запрошенная страница (нет отката на промежуточный ответ).  
6. Mobile: то же keep-previous поведение для карточек.

---

## Порядок коммитов / один PR

Один PR, предпочтительно один коммит:

```
fix(procurement): keep previous planner rows while paging

Avoid blanking the planning table on page/pageSize changes;
hard-clear on filter scope change; ignore stale fetches.
```

Ветка: `cursor/planner-table-keep-previous` (или `agent/…`).  
База: актуальный `main`.  
Не смешивать со Stage 3 / supplier Today / snapshot guard.

---

## Preflight исполнителя (когда перейдёте к коду)

1. Прочитать этот план и аудит.  
2. Дифф только по файлам из §«Список файлов».  
3. Прогнать `verify:procurement-pagination-ux`.  
4. Не коммитить, пока владелец не попросит.
