# Оплаты поставщикам: устаревший долг за прошлые месяцы

Дата: 2026-08-19. Инициатор: владелец (Данияр). Поверхность: `web.shugyla-market.kz/platform/supplier-payments`.

## Симптом

Поставщик «Игрушка», приёмка №120878173 от 25.07.2026:

| Источник | Сумма | Оплачено | Остаток |
|----------|-------|----------|---------|
| UMAG (`web.umag.kz`) | 311 010 ₸ | 311 010 ₸ | 0 ₸ |
| Платформа, 19.08.2026 | 311 010 ₸ | — | 311 010 ₸, просрочка 25 дней |

Долг попадал в KPI «Просрочено» и в общий долг поставщикам.

## Причина

Календарь оплат хранит `supplier_payment_obligations.current_debt` как зеркало
`umag_supplies.debt` — это зафиксировано в комментарии к колонке
(`supabase/migrations/20260727040000_supplier_payment_obligations.sql:74-75`).
Долг не вычисляется из приёмок, возвратов и платежей.

Три звена дают устаревшее значение:

1. **Синхронизация по месяцу документа.** Кнопка на странице оплат запрашивала только
   текущий месяц (`SupplierPaymentsPanel.jsx:275` до исправления). UMAG выдаёт приёмки
   по периоду документа (`/rest/cabinet/opr/supplies/all` с `fromTime`/`toTime`),
   поэтому 19 августа июльская приёмка не перезапрашивалась.
2. **Платежи не пишут долг приёмки.** Синхронизация `document-payment` заполняет
   `umag_document_payments` и `platform_supplier_ledger_events`, но не обновляет
   `umag_supplies.debt` (`umag-sync/index.ts:2296-2358`).
3. **Пересчёт закреплял устаревшее значение.** `refreshPaymentObligations` брал все
   локальные строки с `debt > 0` и заново записывал их в обязательства.

Расчёт просрочки был верным: для условий «наличные» срок оплаты равен дате документа,
и 19.08 минус 25.07 — ровно 25 дней. Ошибочна была сумма долга.

### Второй, скрытый дефект

Если долг приёмки локально уже нулевой, а обязательство осталось открытым, оно не
попадало ни в запрос по периоду, ни в запрос «долг больше нуля» — и не закрывалось
никогда. Такие строки исправляются отдельным проходом.

Проход добавлен в `refreshPaymentObligations`, то есть он работает **и при синхронизации
взаиморасчётов**. Это означает, что первый же прогон любой синхронизации после деплоя
закроет накопившиеся зависшие обязательства — ожидаемый эффект, а не побочный.

## Решение

Три PR, каждый в своём направлении:

| PR | Направление | Содержание |
|----|-------------|-----------|
| [#6](https://github.com/dakeci-lab/shugyla-academy/pull/6) | БД | `umag_sync_runs.entity` разрешает значение `obligations` |
| [#7](https://github.com/dakeci-lab/shugyla-academy/pull/7) | Edge | Действие `sync_open_obligations` + закрытие зависших обязательств |
| [#8](https://github.com/dakeci-lab/shugyla-academy/pull/8) | Фронтенд | Вызов нового действия, охват периода, частичный прогон |

PR последовательные: #7 основан на #6, #8 основан на #7. Это соответствует порядку
деплоя и избавляет от конфликта в `package.json`. Сливать в порядке #6 → #7 → #8.

Ключевые принципы:

- **Источником истины остаётся UMAG.** Долг не вычисляется локально из реестра
  платежей — затронутые месяцы просто перечитываются.
- **Только целые календарные месяцы.** Сверка удалённых приёмок сравнивает снимок UMAG
  со всем содержимым окна, поэтому частичное окно пометило бы лишние строки удалёнными.
- **Устаревшая строка лучше ложного удаления.** Все существующие защиты сверки сохранены:
  полная пагинация, совпадение агрегатов, отсутствие дублей и пустых ID.
- **Лимит глубины** — 12 месяцев за прогон, более старые перечисляются в предупреждении.
  Такие месяцы не теряются: их можно синхронизировать вручную из взаиморасчётов.
- **Бюджет времени** 120 с: один месяц завершается всегда, далее прогон
  останавливается между месяцами и сообщает остаток. Порядок от старых к новым.
- **Справочник поставщиков обновляется, как и раньше.** Прежняя синхронизация оплат
  вызывалась с `syncSuppliers: true`; без этого приёмка нового поставщика получила бы
  `platform_supplier_id = null`, а её обязательство отображалось бы без названия и без
  возможности настроить срок. Сбой обновления справочника не отменяет обновление долга.

## Preflight

Выполнить до применения (заменить имя поставщика при необходимости).

```sql
-- 1. Спорная приёмка: зеркало долга против обязательства
select
  ps.name,
  s.umag_supply_id,
  s.doc_time,
  s.amount,
  s.payment_amount,
  s.debt        as mirror_debt,
  o.current_debt,
  o.due_date,
  o.paid_at,
  o.last_synced_at
from public.supplier_payment_obligations o
join public.umag_supplies s on s.umag_supply_id = o.umag_supply_id
left join public.platform_suppliers ps on ps.id = o.platform_supplier_id
where lower(ps.name) like '%игрушка%'
  and o.is_source_deleted = false
order by s.doc_time desc;

-- 2. Какие периоды реально синхронизировались
select entity, date_from, date_to, status, finished_at, warning_message
from public.umag_sync_runs
order by started_at desc
limit 10;

-- 3. Месяцы с открытым долгом — сколько месяцев затронет прогон
select to_char(s.doc_time at time zone 'Asia/Aqtobe', 'YYYY-MM') as month,
       count(*) as supplies,
       sum(s.debt) as debt
from public.umag_supplies s
where s.is_source_deleted = false and s.debt > 0
group by 1
order by 1;

-- 4. Зависшие обязательства: долг в обязательстве при нулевом долге приёмки
select count(*) as orphan_obligations
from public.supplier_payment_obligations o
join public.umag_supplies s on s.umag_supply_id = o.umag_supply_id
where o.is_source_deleted = false
  and o.current_debt > 0
  and coalesce(s.debt, 0) <= 0;
```

Ожидания перед исправлением: запрос 1 показывает `current_debt = 311010`, запрос 2 —
прогоны только за август, запрос 3 включает `2026-07`.

## Применение

Порядок обязателен: без миграции запись прогона отклоняется constraint-ом.

1. Применить миграцию `20260819103000_umag_sync_runs_obligations_entity.sql`.
2. Задеплоить Edge-функцию `umag-sync`.
3. Задеплоить фронтенд.
4. На странице «Оплаты поставщикам» нажать синхронизацию.

Деплой выполнять вне часа пик: в платформе ежедневно работают 13–15 сотрудников.

## Postcheck

```sql
-- Прогон журналируется отдельно и охватывает июль
select entity, date_from, date_to, status, records_received, warning_message
from public.umag_sync_runs
where entity = 'obligations'
order by started_at desc
limit 3;

-- Долг «Игрушки» закрыт
select ps.name, o.current_debt, o.paid_at
from public.supplier_payment_obligations o
left join public.platform_suppliers ps on ps.id = o.platform_supplier_id
where lower(ps.name) like '%игрушка%' and o.is_source_deleted = false;

-- Зависших обязательств не осталось
select count(*) as orphan_obligations
from public.supplier_payment_obligations o
join public.umag_supplies s on s.umag_supply_id = o.umag_supply_id
where o.is_source_deleted = false
  and o.current_debt > 0
  and coalesce(s.debt, 0) <= 0;
```

Критерии приёмки:

1. «Игрушка» исчезает из вкладки «Просрочено», долг 0 ₸.
2. Общий долг поставщикам уменьшается примерно на 311 010 ₸.
3. В журнале есть запись `entity = 'obligations'` с периодом, включающим июль 2026.
4. Запрос по зависшим обязательствам возвращает 0.
5. **Остальные поставщики с реальным долгом остаются на месте** — главный контроль
   отсутствия перегибов.
6. В шапке страницы «Охват» показывает период, включающий июль.

## Проверка кодом

```bash
npm run verify:umag-sync-runs-entity        # 6
npm run verify:umag-open-obligations-sync   # 22
npm run verify:supplier-payments            # 16
npm run verify:umag-sync-settlements-ux     # 82
npm run verify:supplier-ledger              # 26
npm run verify:supplier-reconciliations     # 8
npm run verify:supplier-centralization      # 7
npm run verify:umag-supply-returns          # 7
npm run verify:umag-operation-details       # 6
npm run build
```

Типы Edge-функции: `deno check supabase/functions/umag-sync/index.ts` — новых ошибок нет
(7 существующих ошибок в `_shared/` присутствуют и на `main`).

## Откат

Обратный порядок применения:

1. Вернуть предыдущую сборку фронтенда.
2. Вернуть предыдущую версию Edge-функции `umag-sync`.
3. Только после этого откатить миграцию.

**Важно.** Простое возвращение constraint-а к трём значениям **упадёт**, если хотя бы один
прогон уже попал в журнал: `ALTER TABLE ... ADD CONSTRAINT CHECK` проверяет существующие
строки. Проверено на настоящем Postgres, ошибка:
`check constraint "umag_sync_runs_entity_check" of relation "umag_sync_runs" is violated by some row`.

Поэтому строки журнала нужно сначала переназначить. Записи журнала — диагностика,
их значение можно безопасно перевести в `all`:

```sql
begin;

alter table public.umag_sync_runs
  drop constraint if exists umag_sync_runs_entity_check;

update public.umag_sync_runs
set entity = 'all'
where entity = 'obligations';

alter table public.umag_sync_runs
  add constraint umag_sync_runs_entity_check check (
    entity in ('suppliers', 'supplies', 'all')
  );

commit;
```

Если журнал прогонов важно сохранить как есть, откат миграции можно просто не выполнять:
расширенный constraint безвреден при откаченном коде.

Данные при откате не теряются: долг всегда перезапрашивается у UMAG. Уже закрытые
обязательства останутся закрытыми — это соответствует состоянию UMAG.

## Обходной путь без деплоя

На странице «Взаиморасчёты» выбрать период 01.07.2026–31.07.2026 и нажать синхронизацию.
Это перечитает июль и закроет долг, но не устранит причину: следующий месяц с
переносом оплаты приведёт к той же ситуации.

## Известные ограничения

Выявлены при повторной проверке, ни одно не блокирует выпуск:

1. **Обязательство без строки приёмки не закрывается.** Если приёмка отсутствует в
   `umag_supplies`, обязательство остаётся открытым — сознательно: лучше показать долг,
   чем обнулить его без подтверждения от UMAG. Проверено функциональным тестом.
   Диагностика: расхождение `requested`/`resolved` в логе `spo_orphan_obligations_reloaded`.
2. **«Охват» показывает последний прогон любого типа.** Если после синхронизации оплат
   кто-то синхронизирует один день из взаиморасчётов, в шапке будет виден этот день.
   Это честно отражает последний прогон, но не охват именно календаря оплат.
3. **Прогон, убитый по таймауту платформы, остаётся в журнале со статусом `running`.**
   Поведение унаследовано от существующей синхронизации; повторный прогон создаёт новую
   запись и корректно завершается.
4. **Возвраты, платежи и реестр обновляются только за текущий месяц** — как и прежней
   кнопкой оплат. За прошлые месяцы их по-прежнему обновляют взаиморасчёты.
5. **`reconcileCanonicalSuppliers` читает `umag_suppliers` без пагинации** (лимит
   PostgREST 1000 строк). Пре-существующее поведение полной синхронизации, к текущему
   числу поставщиков неприменимо.

## Сознательно вне объёма

- Пересборка возвратов и реестра платежей за **исторические** месяцы: на долг не влияет,
  но заметно удлинила бы прогон.
- Автоматическая фоновая синхронизация по расписанию.
- Единая трактовка копеек: взаиморасчёты используют `SUPPLY_PAYMENT_EPSILON = 0.01`,
  обязательства сравнивают долг строго с нулём. На текущих данных расхождения нет.
- Ограничение частоты вызовов синхронизации: отсутствует и у существующего действия.
