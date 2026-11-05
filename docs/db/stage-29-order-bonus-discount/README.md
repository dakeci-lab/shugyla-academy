# Этап 29 — бонус и скидки в заказах закупа

**Решение владельца (2026-11-05).** Акции поставщиков приходят устно от торгового представителя, поэтому вводятся
вручную. В UMAG бонус принимается отдельной строкой того же товара с нулевой ценой (при будущей выгрузке).

## Что хранится

| Таблица | Колонка | Смысл |
|---|---|---|
| `purchase_order_items` | `bonus_qty` | бесплатные штуки сверх `ordered_qty` (не оплачиваются) |
| | `promo_buy`, `promo_free` | правило «5+1» (купи 5, получи 1), бонус считается по ЦЕЛОЙ части: `floor(qty / promo_buy) * promo_free` |
| | `discount_pct` | скидка от базовой цены строки, 0..100 |
| `purchase_orders` | `discount_pct` | скидка на всю накладную: значение по умолчанию для строк |

Базовая цена (`purchase_price`) не меняется. Сумма строки = `round(ordered_qty × purchase_price × (1 − discount_pct/100), 2)`:
её держит строчный триггер `purchase_order_items_calc_line_total`, сумма заказа — по-прежнему сумма строк (триггеры этапа заказов).
Скидка строки заменяет скидку накладной (не умножается на неё): при смене скидки накладной меняются только строки,
у которых скидка была равна прежней скидке накладной.

Функции: `procurement_submit_order` (пересчёт строк при «Сохранить» — со скидкой) и `procurement_apply_plan`
(«в пути» = заказано + бонус).

## Preflight (выполнено перед применением)

- функции, читающие `ordered_qty` / `purchase_order_items`: `purchase_order_items_fill_unit_v1`, `procurement_apply_plan`, `procurement_submit_order`, `procurement_delete_draft_order`, `purchase_order_items_recalc_totals` — меняются только две (см. выше);
- триггеры на `purchase_order_items`: заполнение единицы, три триггера пересчёта суммы заказа, `updated_at` — порядок не конфликтует с новым BEFORE-триггером;
- код: чтение/запись строк только через `purchaseSupabaseAdapter.js`.

## Postcheck

```sql
select column_name from information_schema.columns
 where table_schema = 'public' and table_name in ('purchase_order_items', 'purchase_orders')
   and column_name in ('bonus_qty', 'promo_buy', 'promo_free', 'discount_pct');   -- 3 + 1 строк = 4
select count(*) from public.purchase_order_items where bonus_qty <> 0 or discount_pct <> 0;  -- 0 сразу после применения
```

## Откат

`rollback.sql` (SQL Editor: удаление колонок через MCP требует интерактивного подтверждения).

## Урок этапа: права по колонкам

Записи в `purchase_orders` / `purchase_order_items` выданы роли `authenticated` **по колонкам** (колонки планировщика закрыты),
поэтому новые колонки после `alter table` читаются, но не пишутся, пока не выдан `grant insert (...), update (...)`.
Это отдельная миграция `order_bonus_discount_grants` (в репозитории — в конце того же файла). Проверка:
`has_column_privilege('authenticated', 'public.purchase_order_items', 'bonus_qty', 'INSERT')` → `true`.
