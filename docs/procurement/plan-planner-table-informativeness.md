# План: информативность таблицы Planning (недели → акценты → категории)

**Статус:** P0–P2 реализованы (verify зелёный; коммит/PR — по команде владельца). P3 не начат.  
**Дата:** 2026-08-20.  
**Опора:** `docs/procurement/audit-planner-table-informativeness.md`  
**Формат:** серия из трёх узких PR (P0 → P1 → P2). P3 (server-tree) **не планируем** в этом документе — только запасной путь, если P2 не хватит по отзыву владельца.

Решения владельца (закрывают вопросы аудита):

| # | Тема | Решение |
|---|------|---------|
| 1 | Доставка | Серия PR: P0 недели → P1 акценты+шапка → P2 dual-mode. P3 только если P2 мало |
| 2 | Mobile недели | Не 8 колонок; spark / упрощённый вид |
| 3 | ABC | Компактнее на desktop |
| 4 | Шапка | Краткая: период · формула · «к заказу N» (поля snapshot уже есть) |
| 5 | «Только к заказу» | Заметный toggle/chip в primary toolbar (не только advanced checkbox) |
| 6 | Дерево | Вариант **C** (+ опционально A-light group headers). Без загрузки 10k SKU. Без fake page-counts как «полный Focus» |
| 7 | Стек / ширина | Без новых UI-библиотек; sticky товар/заказ при недельных колонках |
| 8 | Изоляция | Не смешивать с keep-previous / HR / snapshot-guard |

Противоречий аудиту нет: аудит рекомендовал тот же порядок и вариант C; владелец утвердил серию и уточнил mobile/ABC/шапку/chip.

---

## Общее

### Цель продукта одной фразой

Сделать таблицу Закупки → Планирование читаемой «как Excel»: тренд по неделям, понятная шапка расчёта и заметный «к заказу», затем навигация по категориям — без лживых счётчиков и без выгрузки всего снимка на клиент.

### Non-goals

- P3: server group headers / mixed page / новый RPC пагинации дерева
- Загрузка всех ~10k SKU на клиент для «полного» дерева
- Fake counts «N в категории» только по текущей page как будто это весь snapshot
- Новые UI-библиотеки, Tailwind, виртуальный скролл
- Изменения Edge `umag-procurement`, RLS, SQL schema items (данные уже есть)
- keep-previous pagination, HR clear-shifts, snapshot-guard permission
- Перенос паттерна на Orders / Receiving / Norms (Norms — только визуальный прецедент accordion)
- Точная pixel-копия Focus Pro

### Принципы

1. **Данные уже есть** — этапы в основном UI (+ точечные хелперы/verify); не раздувать sync.
2. **Один PR = один этап** (P0 / P1 / P2); не смешивать этапы в одном диффе.
3. **Честная информативность** важнее «похожести на Focus»: счётчики и иерархия только там, где predicate совпадает с fetch.
4. Чистый CSS, существующие паттерны (`ProcurementNormsView` accordion, chips, sticky).
5. Каждый этап: свой `verify:*` (новый или расширение существующего) + ручной чеклист.

---

## PR P0 — Недели отдельными колонками

**Статус этапа:** реализация сделана, готово к ревью.  
**Verify:** `npm run verify:procurement-planner-weeks`

**Ветка (рекомендация):** `cursor/planner-weekly-columns`  
**Зависимости:** нет (можно начинать сразу).  
**База:** актуальный `main` без смешения с keep-previous/HR/guard.

### UX desktop

- Убрать единую колонку «Продажи 8 нед.» с `WeeklySpark` в thead/tbody.
- Восемь отдельных колонок: одна ячейка = одно число `item.weeklySales[i]` (i = 0…7).
- Порядок как в данных: **0 = oldest, 7 = newest** (как `buildEightWeekRanges` / sync).
- Числа `tabular-nums`, компактная ширина колонки; нули приглушить, ненули чуть сильнее (без тяжёлых «карточек»).
- Горизонтальный скролл таблицы уже через `.proc-planner__table-wrap { overflow-x: auto }` — сохранить.

### UX mobile

- **Не** рисовать 8 колонок.
- Оставить упрощённый вид: текущий `WeeklySpark` **или** эквивалент (пилюли / последние недели + title со всеми 8) — без изменения семантики данных.
- Карточка по структуре в остальном без обязательных правок P0 (акценты — в P1).

### Подписи недель (из `period_from` / `period_to`)

- Источник: `snapshot.periodFrom`, `snapshot.periodTo` (уже в `normalizeSnapshot`).
- Построить 8 коротких заголовков колонок (например `ДД.ММ` конца недели или диапазон `ДД–ДД`), согласованных с логикой восьми недельных окон sync (index 0 у `periodFrom`, index 7 у `periodTo`).
- Хелпер чистый (например в `procurementPlannerUx.js` или рядом): `(periodFrom, periodTo) → string[8]`; fallback, если периода нет: `W1`…`W8` / «1»…«8» + `title` с пояснением.
- Полный диапазон периода дублировать в `title` у `<th>` (доступность).

### Sticky колонки

При ширине 8 недельных колонок закрепить минимум:

| Колонка | Sticky | Зачем |
|---------|--------|-------|
| Товар (или №+Товар) | left | ориентация при горизонтальном скролле |
| Заказ | right **или** left после товара | быстрый ввод не «уезжает» |

Точная схема (left-only vs left+right) — на усмотрение исполнителя при вёрстке; критерий: при скролле недель товар и поле заказа остаются в зоне чтения/ввода. Без новых библиотек — `position: sticky` + фон ячеек + z-index.

ABC в P0 можно оставить как есть по ширине (сжатие — P1), но sticky не должен ломаться из‑за ABC.

### Список файлов (ожидаемый)

| Файл | Что |
|------|-----|
| `src/components/procurement/ProcurementPlannerView.jsx` | 8 `<th>`/`<td>`; mobile spark; colspan; убрать desktop WeeklySpark из колонки |
| `src/components/procurement/ProcurementPlannerView.css` | ширины week-col, sticky product/order, приглушение нулей |
| `src/utils/procurementPlannerUx.js` (или узкий util) | подписи недель из period |
| `scripts/verify-procurement-planner-weeks.mjs` **или** расширение desktop-ux verify | static asserts |
| `package.json` | script `verify:…` если новый файл |
| `docs/procurement/plan-planner-table-informativeness.md` | статус этапа после реализации |

**Не входят:** Edge, SQL, `fetchSnapshotItemsPage` контракт, P1 шапка/ABC, P2 дерево, keep-previous.

### Verify + критерии приёмки

**Verify (идея asserts):**

1. Desktop thead содержит ≥8 week headers / нет единственного «Продажи 8 нед.» как единственной sales-колонки.
2. Рендер ячеек читает `weeklySales[i]` (или эквивалент), не только spark-grid на desktop.
3. Mobile по-прежнему использует spark / compact (нет 8 `<th>` week в mobile layout).
4. Хелпер подписей недель присутствует и опирается на periodFrom/To (или явный fallback).
5. CSS: sticky для product и/или order.

```bash
npm run verify:<weeks-script>
```

**Ручные:**

1. Desktop: 8 колонок чисел; подписи согласованы с периодом снимка; скролл горизонтальный работает.
2. Sticky: товар и заказ остаются видимыми при скролле недель.
3. Mobile: нет 8 колонок; spark/упрощённый вид на месте.
4. Пагинация / сохранение qty / keep-previous не регрессируют (дымовой).

### Риски ширины

- На узких ноутбуках таблица уйдёт в scroll — это ожидаемо; sticky обязателен.
- Слишком широкие подписи `ДД.ММ–ДД.ММ` раздуют колонки → предпочитать короткий ярлык + полный текст в `title`.
- `TABLE_COL_SPAN` вырастет (~10 − 1 + 8) — не забыть empty/loading row.

---

## PR P1 — Акценты + шапка + chip «к заказу»

**Статус этапа:** реализация сделана, готово к ревью.  
**Verify:** `npm run verify:procurement-planner-header`

**Ветка:** `cursor/planner-accents-header`  
**Зависимость:** **после P0** (предпочтение владельца). Параллельно с P0 не вести: иначе конфликты в `ProcurementPlannerView.jsx` / CSS и размытая приёмка «читаемости».  
Исключение: если P0 уже в `main`, P1 базируется на нём.

### Visual hierarchy

| Элемент | Было | Станет |
|---------|------|--------|
| Заказ | Обычная колонка/input | Визуально главный: сильнее weight/фон колонки или input; рядом с sticky |
| Рек. | Равноправна заказу | Вторичная (приглушённый цвет / меньший акцент), смысл сохранён |
| ABC desktop | Три бейджа + широкая шапка sort | **Компактнее**: уже ряд / меньшие бейджи / sort в одну узкую колонку без раздувания до недель |
| Недели (после P0) | Много колонок | Без изменения логики P0; не перебивать заказ |
| Mobile | Рек. в футере | Допустимо усилить заказ в card-grid; без 8 week-колонок |

Не вводить новые метрики (days-of-cover и т.п.) в этом PR.

### Текст шапки (краткая, не копия Focus)

Расширить snapshot-strip / headline. Поля: `periodFrom`, `periodTo`, `orderableCount` (уже в `normalizeSnapshot`), плюс существующие synced/SKU/отриц. по желанию компактности.

**Литералы (зафиксировать в реализации; язык RU):**

- Период: `Период: {DD.MM.YYYY}–{DD.MM.YYYY}` (из `periodFrom`/`periodTo`, timezone отображения как в остальном planner — `Asia/Almaty` / локаль `ru-KZ`).
- Формула (одна короткая строка, без LaTeX):  
  `Рек. = max(0, round(Ср/день × Норма − Остаток*))`  
  где в `title`/подсказке: `Ср/день = сумма 8 нед. / 56`; `Остаток* = max(0, остаток UMAG)`.
- К заказу: `К заказу: {N}` — **N = `snapshot.orderableCount`** (снимок целиком).  
  Если выбран поставщик и в `filterOptions.suppliers` есть `orderablePositions` — **допустимо** показать вторично `· у поставщика: M` в том же chip/строке; минимум v1: глобальный N снимка.

UMAG synced-line можно сохранить рядом или свернуть в `title`, чтобы не спорить с новой смысловой строкой — на усмотрение, но период · формула · к заказу должны читаться без охоты.

Хелпер: расширить `buildSnapshotHeadline` **или** отдельный `buildPlannerSenseLine` (pure) + verify.

### Toggle `orderableOnly`

- Добавить заметный **chip / toggle в primary toolbar** (рядом с поставщиком / поиском), связанный с уже существующим `filters.orderableOnly` → PostgREST `final_order_qty > 0`.
- Advanced checkbox не обязан удаляться: может остаться синхронизированным тем же state (один источник правды).
- Подпись chip: `К заказу` или `Только к заказу`; `aria-pressed` при включении.
- Счётчик на chip: опционально тот же N; не обязателен, если N уже в шапке.

### Список файлов (ожидаемый)

| Файл | Что |
|------|-----|
| `ProcurementPlannerView.jsx` | hierarchy, sense-line, toolbar chip, ABC compact markup |
| `ProcurementPlannerView.css` | заказ/рек/ABC compact, chip |
| `src/utils/procurementPlannerUx.js` | headline / sense-line pure helpers |
| `scripts/verify-procurement-planner-header.mjs` (или расширить desktop-ux) | asserts |
| `package.json` | при новом script |
| этот plan-док | статус P1 |

**Не входят:** недельные колонки с нуля (уже P0), dual-mode категорий, SQL/Edge.

### Verify + приёмка

**Asserts (идея):**

1. В UI/хелпере есть литералы периода / формулы / «К заказу».
2. Primary toolbar содержит control, меняющий `orderableOnly` (не только advanced checkbox).
3. ABC desktop compact class / упрощённая разметка.
4. Заказ-колонка/input имеет accent class.

**Ручные:**

1. Шапка: период совпадает со снимком; формула понятна; N ≈ ожидание после sync.
2. Chip «только к заказу» фильтрует строки; сброс возвращает полный список (с учётом поставщика).
3. Desktop: заказ заметнее рек.; ABC уже не «съедает» неделю.
4. Регрессия P0: 8 колонок + sticky на месте.

---

## PR P2 — Dual-mode «По категориям»

**Статус этапа:** реализация сделана, готово к ревью.  
**Verify:** `npm run verify:procurement-planner-categories`

**Ветка:** `cursor/planner-category-mode`  
**Зависимость:** после P1 в `main` (UI toolbar уже плотный; меньше конфликтов).  
**Модель:** вариант **C** из аудита.

### UX: переключатель

- В primary toolbar (или вторичной полосе под ним): сегмент / два chip  
  **`Плоский`** | **`По категориям`**.
- Режим по умолчанию: **Плоский** (текущее поведение списка SKU).
- Состояние режима — локальный UI state (не обязательно URL в v1); сброс категорийных фильтров при уходе в «Плоский» — явно: очистить `categoryName`/`subcategoryName`, оставить поставщика/search/orderable.

### Drill-down: cat → (sub) → SKU

1. **По категориям, корень:** список категорий (как Norms-accordion tone): имя + **честный** count.
2. Клик по категории → выставить `filters.categoryName` → показать либо подкатегории, либо сразу SKU-таблицу (если подкатегорий нет / одна).
3. Клик по подкатегории → `filters.subcategoryName` + существующий `fetchSnapshotItemsPage` (flat SKU + пагинация + qty edit + keep-previous как есть).
4. Хлебные крошки: `Все категории / {Cat} / {Sub}` с навигацией назад.
5. Таблица SKU в этом режиме = та же, что в плоском (недели P0, акценты P1), но scope уже сужен фильтрами.

**Не делать:** одну простыню на 10k с клиентским tree; не подменять `totalCount` страницы за «count категории».

### Откуда counts

| Уровень | Источник counts | Честность |
|---------|-----------------|-----------|
| Категории / пары cat+sub | Уже есть каркас в `filterOptions` (`categories`, `categorySubcategories`) | Сейчас scan **всего** snapshot (лёгкие колонки), **без** учёта supplier/search/orderable |
| v1 минимума | Показать counts из filterOptions **и** подпись/title: «по снимку» **или** пересчитать aggregate с тем же supplier/orderable predicate, что активен в toolbar | Если count не под фильтр поставщика — **нельзя** выдавать за «у этого поставщика» |
| Предпочтение плана | При активном `platformSupplierId` / `orderableOnly` — counts либо (a) из расширенного aggregate/scan под те же фильтры, либо (b) без числа, только имена, пока нет aggregate | Запрещены fake counts = `items.length` текущей page |

Реализация counts: предпочтительно расширить существующий filter scan/accumulator **или** узкий `group by` select только имён+count — без mixed header pagination (это было бы B/P3).

### Optional A-light group headers

- Только в режиме **Плоский** (или в SKU-таблице после выбора cat), и **только** когда sort = default (`category_name`, `subcategory_name`, `product_name`) — т.е. нет активного ABC sort.
- При смене `categoryName`/`subcategoryName` на границе строк вставлять visually distinct `<tr>`-разделитель с **именем** группы.
- Счётчик на таком header: **не показывать** как полный Focus-count; допустимо без цифры или с явной пометкой «на странице: k» мелким текстом — по умолчанию плана: **имя без fake total**.
- При ABC sort / search, режущем смежность — headers выключить.

### Почему не B / P3 в этом плане

Server mixed stream (headers+items) и keyset по дереву — отдельный контракт пагинации, высокий риск регрессий generate/save/verify. Владелец: P3 только если после P2 навигации C всё ещё мало. Этот план **не** специфицирует RPC/SQL для B.

### Список файлов (ожидаемый)

| Файл | Что |
|------|-----|
| `ProcurementPlannerView.jsx` | mode switch, category navigator, breadcrumbs, optional group headers |
| `ProcurementPlannerView.css` | list/accordion, crumbs, group row |
| `src/utils/procurementPlannerUx.js` (+ при необходимости filter accumulator) | честные counts / mode helpers |
| `scripts/verify-procurement-planner-categories.mjs` | asserts mode C + no full-client load |
| `package.json` | script |
| этот plan-док | статус P2 |

**Не входят:** новый pagination RPC, загрузка всех items, P3.

### Verify + приёмка

**Asserts:**

1. Есть UI-переключатель плоский / по категориям.
2. Выбор категории ставит `categoryName` (или эквивалент filter) и уходит в существующий page fetch — нет `.select` без range на все items.
3. Group headers (если есть) завязаны на default sort / отключаются при ABC sort.
4. Нет литералов/кода, суммирующих page items как «полный count категории» для корневого списка (или явная «на странице» маркировка только у A-light).

**Ручные:**

1. Плоский ↔ По категориям без поломки поставщика и «к заказу».
2. Drill-down: cat → sub → SKU; назад по крошкам; пагинация и правка qty работают.
3. Counts не врут относительно заявленной подписи (снимок vs поставщик).
4. ABC sort в плоском: без вводящих в заблуждение group totals.
5. Mobile: навигация по категориям usable (список + карточки SKU), без 8 week-колонок.

---

## Порядок выкладки

```text
P0 (недели) → verify зелёный → ревью → merge/прод по команде владельца
    → P1 (акценты + шапка + chip) → verify → ревью → merge/прод
        → P2 (dual-mode категории) → verify → ревью → merge/прод
```

- Коммит/push/PR — только по явной команде владельца на каждый этап.
- Не открывать один PR на все три этапа.
- После P2: собрать отзыв смены; **P3 не начинать**, пока владелец явно не скажет, что C мало.

Рекомендуемые сообщения коммитов (ориентир):

```text
feat(procurement): show planner weekly sales as columns
feat(procurement): planner header sense line and orderable chip
feat(procurement): planner category navigation mode
```

---

## Вопросы аудита — закрытые решениями (кратко)

1. Дерево в v1 информативности? → **Нет**; сначала P0/P1, дерево = P2 (C).  
2. Mobile 8 колонок? → **Нет**; spark/упрощённый.  
3. ABC? → **Компактнее** на desktop (P1).  
4. Шапка? → **Краткая** своя (период · формула · к заказу N), не копия Focus.  
5. «Только к заказу»? → **Да**, заметный toolbar chip (P1).  
6. Один PR или серия? → **Серия** P0→P1→P2.

---

## Preflight исполнителя (на каждый этап)

1. Прочитать этот план + соответствующий § аудита.  
2. Дифф только по файлам этапа.  
3. Прогнать verify этапа + дым пагинации qty.  
4. Не коммитить, пока владелец не попросит.
