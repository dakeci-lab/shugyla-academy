# Этап 2 — План: Planning «Сегодня» = дни заказа

**Статус:** реализация сделана, готово к ревью (коммит/PR — по запросу владельца).  
**Дата:** 2026-08-20.  
**Опора:** `docs/procurement/audit-planner-today-supplier-filter.md`  
**PR:** один узкий — только Planning UX-хелперы + UI-тексты Planning + verify.

Решения владельца (ответы на вопросы аудита §«Вопросы владельцу»):

| # | Вопрос аудита | Решение |
|---|---------------|---------|
| 1 | Пустые `orderWeekdays` | Не показывать в «Сегодня»; в «Все» — показывать. Fallback на `deliveryWeekdays` **запрещён**. |
| 2 | Логика / копирайт / rename | Меняем всё три: поле фильтра, тексты Planning, переименование хелпера. |
| 3 | «Визиты поставщиков» | Остаются на `deliveryWeekdays` — **не трогать**. |
| 4 | Скоуп PR | Один узкий PR: Planning + verify. Без RLS / Edge / UMAG / миграций / Receiving. |
| 5 | Сверка прода | Ручной чеклист после мержа — в этом доке; не автоматизировать в PR. |

Противоречий аудиту нет: аудит рекомендовал смену поля и опциональный общий хелпер; владелец утвердил смену поля и **отклонил** общий хелпер в пользу минимального диффа (см. §«Решение по API»).

---

## Цель и non-goals

### Цель

В «Закупки → Планирование» фильтр scope «Сегодня» показывает только активных поставщиков, у которых **сегодня день заказа** (`orderWeekdays`), в таймзоне `Asia/Almaty`. Кейс Kezi (заказ Ср / доставка Чт): в четверг Kezi **не** в «Сегодня».

### Non-goals

- `src/utils/procurementWorkflow.js`, Receiving, `ProcurementPlanDayList`, `buildExpectedDeliveryEntries`
- RLS, Edge Functions, UMAG-синк, миграции БД, сиды
- Унификация `dateToSupplierWeekdayId` vs `getAppTimezoneWeekdayId`
- Лейбл формы «Дни поставки» ↔ таблицы «Дни доставки»
- Автоматический аудит продовых карточек / бэкфилл пустых `order_days`
- Другие баги закупа (snapshot guard, order actions, ABC)

---

## Правило продукта (Planning vs Receiving)

| Поверхность | Смысл дня | Поле | В этом PR |
|-------------|-----------|------|-----------|
| Поставщики (карточка) | два независимых расписания | `order_days` / `delivery_days` | не менять |
| **Планирование → «Сегодня»** | день оформления заказа | **`orderWeekdays`** | **исправить** |
| Планирование → «Все» | весь активный каталог (+ snapshot leftovers) | без weekday-фильтра | поведение сохранить |
| Приёмка / ожидаемые визиты | день приезда товара | `deliveryWeekdays` | не трогать |
| Блок «Визиты поставщиков» | то же | `deliveryWeekdays` | не трогать |

---

## Решение по API

### Переименовать

| Было | Станет | Зачем |
|------|--------|-------|
| `listTodaysScheduledSuppliers` | `listTodaysOrderSuppliers` | имя больше не намекает на «визиты» / schedule-delivery |
| `isSupplierInTodaySchedule` | `isSupplierInTodaysOrderList` | членство в списке дней заказа, не «schedule visits» |
| локальная переменная `scheduledTodaysSuppliers` в `ProcurementPlannerView.jsx` | `todaysOrderSuppliers` | согласованность с новым API |

### Оставить без переименования (минимальный дифф)

| Символ | Почему оставить |
|--------|-----------------|
| `buildPlannerSupplierSelectOptions` | не выбирает weekday-поле; только рендерит переданный список при `scope === 'today'` |
| параметр `scheduledSuppliers` у `buildPlannerSupplierSelectOptions` / `isSupplierInTodaysOrderList` | внутренний контракт; переименование параметра раздувает дифф verify без выигрыша в поведении. В JSDoc параметра указать: «результат `listTodaysOrderSuppliers`» |
| `getAppTimezoneWeekdayId` | уже корректен для Planning |
| всё в `procurementWorkflow.js` | Receiving / визиты |

Старых имён **не** оставлять как deprecated-алиасы — один call site в UI + verify; мёртвые экспорты не нужны.

### Общая `listActiveSuppliersForWeekday` — **нет**

Аудит предлагал опциональный общий хелпер с `{ schedule: 'order' \| 'delivery' }`.  
**Отклонено:** Receiving уже живёт в другом модуле (`buildExpectedDeliveryEntries`); общий хелпер тянет Planning и Receiving в один контракт и расширяет скоуп/риск регрессии. Достаточно точечной смены поля + rename в Planning.

---

## Список файлов к изменению (точный)

| Файл | Что сделать |
|------|-------------|
| `src/utils/procurementPlannerUx.js` | rename + фильтр по `orderWeekdays`; обновить JSDoc (`deliveryWeekdays` / «Визиты» убрать из Planning-хелперов) |
| `src/components/procurement/ProcurementPlannerView.jsx` | импорты, переменная, empty-state литерал |
| `scripts/verify-procurement-desktop-ux.mjs` | новые имена, фикстуры `orderWeekdays`, кейс Kezi, static asserts на литералы/имена |
| `docs/procurement/plan-planner-today-order-days.md` | этот план (уже создан; в PR реализации можно лишь пометить статус «в работе / сделано») |

**Не входят:** `package.json` (новый `verify:*` не заводим — расширяем существующий `verify:procurement-desktop-ux`), `procurementWorkflow.js`, Receiving/PlanDayList, адаптеры поставщиков, миграции.

Опционально в том же PR (только если удобно ревьюеру): одна строка-ссылка в конце аудита на этот план. Не обязательно.

---

## Поведение edge-cases

| Кейс | Ожидание |
|------|----------|
| Пустые `orderWeekdays` (в т.ч. только доставка заполнена) | Нет в «Сегодня»; есть в «Все» (если `status === 'active'` и проходит остальные правила каталога). **Без** fallback на `deliveryWeekdays`. |
| Kezi: `orderWeekdays=['wed']`, `deliveryWeekdays=['thu']`, сегодня `thu` | Нет в «Сегодня». |
| Kezi, сегодня `wed` | Есть в «Сегодня». |
| Оба поля содержат сегодня | Есть в «Сегодня» (критерий — только order). |
| `status !== 'active'` | Нет в «Сегодня» (как сейчас). |
| Scope «Все» | Как сейчас: активный каталог + legacy snapshot-only; weekday не фильтрует. |
| Переключение «Все» → «Сегодня», выбран поставщик не из сегодняшнего order-списка | `isSupplierInTodaysOrderList` → false → сброс `platformSupplierId` (текущая логика `handleSupplierScopeChange`, новые имена). |
| Пустой массив / не-массив `orderWeekdays` | Как сейчас для delivery: не проходит `Array.isArray` / `includes` → исключить. |
| Дубликаты id в каталоге | `seen` Set сохраняем. |

---

## План обновления verify

Скрипт: **`scripts/verify-procurement-desktop-ux.mjs`** (`npm run verify:procurement-desktop-ux`). Отдельный `verify:*` **не** создавать.

### Runtime (импорт `procurementPlannerUx.js`)

1. Заменить вызовы `listTodaysScheduledSuppliers` → `listTodaysOrderSuppliers`, `isSupplierInTodaySchedule` → `isSupplierInTodaysOrderList`.
2. Фикстуры inactive/other-day: поле **`orderWeekdays`** вместо `deliveryWeekdays` (сценарий «inactive excluded»).
3. Stage 2c (`stageSupplierScopeOptions`): то же для scheduled/catalog фикстур.
4. **Новый assert — Kezi:**

```js
// псевдокод намерения
const kezi = {
  id: 'kezi',
  name: 'TOO Kezi',
  status: 'active',
  orderWeekdays: ['wed'],
  deliveryWeekdays: ['thu'],
}
listTodaysOrderSuppliers([kezi], { weekdayId: 'thu' }) // → []
listTodaysOrderSuppliers([kezi], { weekdayId: 'wed' }) // → [kezi]
// контроль: delivery-only не должен протащить в today
const deliveryOnly = {
  id: 'd-only',
  name: 'Only Delivery',
  status: 'active',
  orderWeekdays: [],
  deliveryWeekdays: ['thu'],
}
listTodaysOrderSuppliers([deliveryOnly], { weekdayId: 'thu' }) // → []
```

### Static (чтение исходников)

| Assert сейчас | После |
|---------------|--------|
| `planner.includes('listTodaysScheduledSuppliers')` | `listTodaysOrderSuppliers` |
| `planner.includes('На сегодня визитов нет')` | новый литерал (см. §UI-копирайт) |
| при желании усилить | `!planner.includes('listTodaysScheduledSuppliers')` и `!uxSrc` старых имён; `procurementPlannerUx` содержит `orderWeekdays` в теле list-хелпера и **не** фильтрует по `deliveryWeekdays` в этой функции |

Receiving / `Визиты поставщиков` в static-проверках страницы заказов **не менять** (assert «Orders tab no plan list» остаётся).

---

## UI-копирайт: точные литералы

Найдены в Planning (менять только их):

| Файл | Сейчас | Станет |
|------|--------|--------|
| `ProcurementPlannerView.jsx` | `'На сегодня визитов нет'` | `'На сегодня заказов нет'` |
| `procurementPlannerUx.js` JSDoc у list-хелпера | «…(deliveryWeekdays). Same source semantics as «Визиты поставщиков».» | описать orderWeekdays / день заказа; без ссылки на визиты |
| `procurementPlannerUx.js` JSDoc у `buildPlanner…` | «today: scheduled active visits…» | «today: active suppliers with order day = today…» |
| `procurementPlannerUx.js` JSDoc у membership-хелпера | «today's scheduled visits» | «today's order-day list» |

**Не менять** (не про визиты / уже нейтрально):

- `` `Сегодня · ${…}` `` — кнопка scope
- `'Все'`
- `'Выберите поставщика'`, `'Загрузка поставщиков…'`, `'Поиск поставщика…'`
- `PROCUREMENT_PLAN_LABEL = 'Визиты поставщиков'` и любые строки Receiving

Альтернатива empty-state `'Нет поставщиков с днём заказа сегодня'` — длиннее; предпочтение владельцу минимального сдвига смысла: **«На сегодня заказов нет»**.

---

## Критерии приёмки

### Verify

- `npm run verify:procurement-desktop-ux` — зелёный, включая Kezi + delivery-only + rename/static literals.

### Ручные (локально / staging после деплоя)

1. Карточка поставщика: заказ Ср, доставка Чт → в Planning в **среду** виден в «Сегодня»; в **четверг** — нет; в «Все» — да оба дня.
2. Поставщик только с днями доставки, пустой заказ → нет в «Сегодня», есть в «Все».
3. Empty-state при нуле order-today: текст **«На сегодня заказов нет»** (не «визитов»).
4. Выбрать поставщика из «Все», переключить на «Сегодня» если его нет в order-today → выбор сбрасывается.
5. Receiving / «Визиты поставщиков»: поведение дней доставки **без изменений** (smoke: известный поставщик с delivery=сегодня по-прежнему в визитах).

---

## Порядок коммитов / один PR

Один PR, предпочтительно **один коммит** (узкая тема):

```
fix(procurement): Planning Today uses order weekdays

Filter planner supplier scope by orderWeekdays, rename helpers,
update empty-state copy, lock Kezi case in desktop-ux verify.
```

Если удобнее два коммита в том же PR: (1) хелпер + UI, (2) verify — допустимо; не дробить на отдельные PR.

Ветка: `cursor/planner-today-order-days` (или `agent/…` по процессу команды).  
База: актуальный `main`.  
Не смешивать с snapshot-guard / order-actions.

---

## Чеклист ручной сверки прода после мержа

Цель: найти карточки, где закупщик опирался на «Сегодня» как на список **визитов** (заполнена только доставка).

1. Открыть **Поставщики** (каталог UMAG / Все).
2. Для поставщиков с непустыми «Дни доставки» проверить «Дни заказа»:
   - пусто → кандидат на ручное заполнение; до заполнения **не** появится в Planning «Сегодня».
3. Особо сверить регулярных поставщиков смены (в т.ч. «TOO Kezi» и аналоги Ср→Чт).
4. В день заказа: Planning «Сегодня» совпадает с ожидаемым списком заказов; в день только доставки — список короче/другой, визиты на приёмке на месте.
5. Зафиксировать список «надо дописать дни заказа» вне этого PR (чат / таблица владельца) — **без** скрипта в репозитории в этом этапе.

---

## Риски регрессии

| Риск | Митигация |
|------|-----------|
| Список «Сегодня» резко укоротится у кого пустые `order_days` | Ожидаемо; чеклист прода + «Все» как обход |
| Verify/static ломаются на старых именах/литерале | Обновить в том же PR |
| Случайно задеть Receiving | Diff-review: zero changes under workflow/receiving/PlanDayList |
| Legacy name-match в membership-хелпере | Поведение сохранить; только rename + источник списка |
| Путаница «заказов нет» vs «нет оформленных purchase orders» | Смысл = нет поставщиков с днём **заказа** сегодня; при жалобе UX — уточнить копирайт отдельным микро-PR |

---

## Preflight исполнителя (когда перейдёте к коду)

1. Прочитать этот план и аудит.
2. Дифф только по трём файлам кода/verify (+ опционально статус в доках).
3. Прогнать `npm run verify:procurement-desktop-ux`.
4. Не коммитить, пока владелец не попросит (или по явной команде на PR).
