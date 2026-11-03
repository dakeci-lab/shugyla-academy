# Этап 28 — удалить раздел «Главная» (продажи)

Решение владельца (2026-11-03). Раздел «Главная» (бывшие «Продажи»: выручка и маржа, аналитика, «оцифровка», синхронизация продаж UMAG)
убран целиком. Вход на платформу ведёт в «Закуп» (администратор, закупщик) или «Заказы» (приёмщик).

## Что сделано в коде (PR)
- Удалены страница `pages/platform/sales`, компоненты `components/sales`, `salesDataService`, утилиты `salesHeat/Export/Aggregation/Format`.
- Удалена Edge Function `umag-sales-sync` (папка и блок в `supabase/config.toml`).
- Из меню убран пункт «Главная», маршрут `/platform/sales` теперь перенаправляет на `/platform`.
- Из RBAC убраны маршрут `ROUTE_KEYS.SALES`, права `sales.view` / `sales.sync` и модуль «Продажи» в матрице ролей.
- Планирование закупа **не затронуто**: оно считает продажи из своих снимков (`procurement_snapshot_items.weekly_sales`, функция `umag-procurement`),
  а не из таблиц `sales_*`.

## Preflight (2026-11-03, prod `cxadzerxndlscwvdaymk`)
- Таблицы: `sales_category_month_facts` (≈3,8 тыс. строк, 1,7 МБ), `sales_month_receipt_facts` (24 КБ). Больше объектов `*sales*` в `public` нет.
- Функций `public`, ссылающихся на эти таблицы, нет; cron-задач с «sales» нет.
- Права `sales.view`, `sales.sync` выданы двум ролям (по 2 строки `role_permissions`).
- Журнал синка: 49 строк `umag_sync_runs` с `entity = 'sales_facts'` (все `success`).
- Код: единственные читатели таблиц — `salesDataService` и `umag-sales-sync` (оба удалены этим PR); `grep` по `.from('sales_` — пусто.

## Аудит связей (2026-11-03, перед удалением данных)
- **БД:** внешних ключей к `sales_*` и от них нет; представлений, зависящих от них, нет; единственные триггеры — `updated_at` на самих таблицах
  (общая функция `academy_set_updated_at` остаётся — она нужна ещё 10 таблицам); функций/процедур во всех схемах с упоминанием `sales_category_month`,
  `sales_month_receipt`, `sales_facts` нет; cron-задач 3 (`procurement-sync…0700`, `procurement-archive…0730`, `procurement-ensure-plan…`), ни одна не про продажи.
- **Права:** `sales.view` / `sales.sync` выданы ролям `admin` и `buyer` (закупщик тоже видел «Главная»); других таблиц со ссылкой на `permissions` кроме `role_permissions` нет.
- **Журнал синка:** `umag_sync_runs` содержит 213 строк `all`, 2 `obligations` и 49 `sales_facts`. Удаляются только `sales_facts`. `fetchLastUmagSyncRun`
  («последний синк» в «Расчётах») читает последнюю строку **без фильтра по entity** — строки `sales_facts` могли подменять статус синка «Расчётов»; после удаления
  показывается именно синк «Расчётов».
- **Другие страницы:** «Закуп», «Заказы», «Расчёты», «Склад», «Счета оплаты», «Пользователи», «Роли и доступы» к `sales_*` и `umag-sales-sync` не обращаются
  (`grep` по `src` и `supabase/functions` пуст; колонки `weekly_sales`, `sales_8w`, `sales_per_day` — в снимках закупа и позициях заказов, не затрагиваются).
- **Edge Functions в проде:** `umag-sales-sync` активна (v14), но вызывалась только удалённой страницей.
- **Единственный риск:** вкладка браузера/PWA со старой версией фронта, открытая на «Главной», после `drop` покажет ошибку загрузки до перезагрузки страницы.

## Что делает владелец (SQL Editor; `drop` через MCP не проходит)
1. **После слияния** убедиться, что фронт задеплоен (старая страница уже не читает таблицы).
2. Удалить Edge Function `umag-sales-sync`: Supabase → Edge Functions → `umag-sales-sync` → Delete (или `npx supabase functions delete umag-sales-sync --project-ref cxadzerxndlscwvdaymk`).
3. SQL (одной транзакцией, без `CASCADE` и `IF EXISTS`):

```sql
begin;
delete from role_permissions where permission_id in (select id from permissions where code in ('sales.view', 'sales.sync'));
delete from permissions where code in ('sales.view', 'sales.sync');
delete from umag_sync_runs where entity = 'sales_facts';
drop table public.sales_month_receipt_facts;
drop table public.sales_category_month_facts;
commit;
```

Postcheck:
```sql
select count(*) from pg_class where relname in ('sales_category_month_facts', 'sales_month_receipt_facts');   -- 0
select count(*) from permissions where code like 'sales.%';                                                  -- 0
select count(*) from umag_sync_runs where entity = 'sales_facts';                                           -- 0
```

## Проверка
`npm run verify:sales-home-removed`; вручную: вход на `web.shugyla-market.kz` открывает «Закуп», в меню нет «Главная»,
в «Роли и доступы» нет вкладки «Продажи».

## Откат
Код — вернуть коммит. Данные продаж после `drop` не восстановить (источник — UMAG; историю можно заново выкачать функцией из git,
если она понадобится). Миграции создания таблиц остаются в `supabase/migrations/` (`20260829120000_sales_category_month_facts.sql`,
`20260830090000_sales_month_receipt_facts.sql`).
