# Аудит — пагинация планирования: таблица исчезает («Загрузка…»)

**Направление:** только аудит (без правок кода, без коммитов).  
**Дата:** 2026-08-20.  
**Кейс:** в Закупки → Планирование при смене страницы / «Строк на странице» тело таблицы пустеет и показывает «Загрузка…»; владелец хочет поведение как в UMAG — старые строки остаются, загрузка в фоне, затем подмена.

---

## Вердикт

Это **чисто фронтовый loading UX**, не отсутствие данных в state и не обязательный «водопад» на 9929 SKU. `loadItems` при валидном снимке **не очищает** `items` перед fetch — только `setLoading(true)`; предыдущая страница остаётся в React state до прихода ответа. Рендер же при `loading === true` **целиком подменяет** `tbody` / мобильный список одной строкой «Загрузка…», поэтому пользователь видит белую дыру. Сервер уже отдаёт одну страницу (`range` + `count`), не весь каталог; SWR для строк планирования нет, но похожий stale-while-revalidate уже есть у filter options / norms.

---

## Доказательства

### Цепочка UI → state → fetch

| Слой | Где | Роль |
|------|-----|------|
| View | `src/components/procurement/ProcurementPlannerView.jsx` | `items`, `page`, `pageSize`, `loading`, `totalCount` |
| Пагинация | `TablePagination.jsx` | `onPageChange={setPage}`; `onPageSizeChange` → `setPage(1)` + `setPageSize` |
| Эффект | `useEffect(() => void loadItems(), [loadItems])` | любой пересчёт `loadItems` → новый fetch |
| Зависимости `loadItems` | `snapshot`, `page`, `pageSize`, `debouncedSearch`, `filters`, `abcSort` | page / pageSize flip входят сюда |
| API | `fetchSnapshotItemsPage` в `procurementPlanningService.js` | PostgREST `procurement_snapshot_items` + `range` + `count: 'exact'` + aggregates по barcode страницы |

### Ключевой код загрузки

```361:390:src/components/procurement/ProcurementPlannerView.jsx
  const loadItems = useCallback(async () => {
    if (!snapshot?.id || snapshot.status === 'syncing' || snapshot.status === 'failed') {
      setItems([])
      ...
      return
    }
    setLoading(true)
    try {
      const result = await fetchSnapshotItemsPage({ snapshotId, page, pageSize, ... })
      setItems(result.items)
      setTotalCount(result.totalCount)
      ...
    } finally {
      setLoading(false)
    }
  }, [snapshot, page, pageSize, debouncedSearch, filters, abcSort, showError])
```

Жёсткий `setItems([])` — **только** когда нет готового снимка (syncing/failed/нет id). При пагинации items в state **сохраняются**, пока не придёт новый `setItems`.

### Условие «Загрузка…» в рендере

Desktop (`tbody`):

```1480:1488:src/components/procurement/ProcurementPlannerView.jsx
              {loading ? (
                <tr>
                  <td colSpan={TABLE_COL_SPAN}>Загрузка…</td>
                </tr>
              ) : items.length === 0 ? (
                ...
              ) : (
                items.map(...)
```

Mobile: `{loading ? <p>Загрузка…</p> : items.length === 0 ? ... : <ul>...}`

Итог: при любом `setLoading(true)` предыдущие rows **не рисуются**, даже если `items` ещё старые.

### Отдельный флаг isFetching

Нет. Один булев `loading` обслуживает и cold start (`useState(true)`), и каждый page flip.

### Сброс page → 1

```400:402:src/components/procurement/ProcurementPlannerView.jsx
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, filters, abcSort, snapshot?.id])
```

Смена поставщика / поиска / ABC / снимка сбрасывает страницу (ожидаемо); это снова триггерит `loadItems` и тот же hard loading UI.

---

## Cold vs soft navigation

| Действие | Тип | Сейчас с items | UI |
|----------|-----|----------------|-----|
| Первый вход / нет данных | Cold | `loading` initial true, items `[]` | «Загрузка…» — уместно |
| Snapshot syncing/failed | Cold / error | `setItems([])` | пусто / загрузка |
| Смена `page` | Soft | items **не** clear до ответа | **hard** «Загрузка…» (баг UX) |
| Смена `pageSize` | Soft | то же (+ `setPage(1)`) | hard «Загрузка…» |
| Смена поставщика / фильтров / search / abcSort | Scope change | page→1, items до ответа старые | hard «Загрузка…» |
| Sync / generate / явный reload `loadItems` | Refresh | как soft по state | hard «Загрузка…» |

---

## Уже есть SWR в проекте (не для строк таблицы)

| Паттерн | Где | Применимость |
|---------|-----|--------------|
| Filter options SWR | `procurementFilterOptionsCache.js` | кэш агрегатов фильтров, не page rows |
| Norms SWR | `procurementNormsCache.js` | модель норм |
| Optimistic schedule sync | `useScheduleBackgroundSync` (`previousData`) | другой домен |
| `cloudStore` module loading | bootstrap модулей | не page UX |

**Переиспользовать напрямую** filter-options cache для строк страницы — нет смысла (другие данные, TTL, storage). Имеет смысл **идею**: `isLoading` (нет данных) vs `isFetching` (есть предыдущие, идёт фон) — локально в Planning или тонкий хук.

SearchableSupplierSelect уже ближе к желаемому: `loading={supplierSelectLoading && supplierSelectOptions.length === 0}` — индикатор только при пустом списке.

---

## Оценка нагрузки на page flip

Не полный reload 9929 SKU: `fetchSnapshotItemsPage` делает **одну** страницу (`range`) + `count` + aggregates по barcode текущей страницы. Это нормальная стоимость пагинации, не Stage 3 request-storm. Улучшение UX **не требует** менять Edge/UMAG/контракт снимка — достаточно не прятать `items` пока `loading`.

Риск при быстрых кликах: **нет** abort / request generation. Ответы могут прийти out-of-order → на экране чужая страница до следующего fetch. Keep-previous без seq/abort усиливает окно рассинхрона (старые строки + новый page number в пагинаторе).

---

## Таблица: hard clear vs soft (рекомендация аудита)

| Триггер | Сейчас UI | Могло бы soft (keep previous) |
|---------|-----------|-------------------------------|
| page / pageSize | hard «Загрузка…» | **да** — главный кейс владельца |
| Тот же snapshot, тот же набор фильтров | hard | **да** |
| Смена supplier / filters / search / abc | hard | вопрос владельцу (часто hard ок) |
| Смена snapshot / syncing | hard clear items | hard оставить |
| Cold: items пустые | «Загрузка…» | оставить full loading |

---

## Рекомендуемые направления фикса (без реализации)

1. **Минимальный (предпочтительный):** ввести `isFetching` / не скрывать rows когда `loading && items.length > 0`; опционально CSS opacity / тонкая полоска; пагинацию `disabled` или ignore clicks на время fetch; `requestId` / ignore stale responses. Не трогать `fetchSnapshotItemsPage`. Не раздувать Stage 3 perf.

2. **Тот же + явный hard reset** при смене supplier/filters/snapshot: `setItems([])` только тогда, чтобы не показывать «чужого» поставщика на полсекунды.

3. **Переиспользуемый хук** (`useKeepPreviousQuery`) — только если владелец хочет тот же паттерн сразу в нескольких таблицах; для одного Planning избыточен в первом PR.

Не делать в том же PR: кэш всех страниц в памяти, virtual scroll всего снимка, изменение SQL/RLS.

---

## Вне скоупа

- UMAG API / контракт синка снимка  
- ABC-алгоритм, snapshot guard permission  
- Supplier filter «Сегодня» / order weekdays  
- HR clear-shifts  
- Stage 3 coalescing workforce / remount storms (другой трек)  
- Переписывание filter-options SWR под items  

---

## Вопросы владельцу для этапа 2 (макс. 5)

1. Cold load (первый вход / пустая таблица) — оставляем полный «Загрузка…»?  
2. Смена поставщика / фильтров / поиска — hard clear или тоже keep previous чужих строк до ответа?  
3. Нужен ли видимый индикатор фона (полоска / opacity) или достаточно тихого swap?  
4. Блокировать ли клики пагинации (и page size) на время fetch?  
5. Паттерн только для Planning в этом PR или сразу закладывать переиспользуемый хук?
