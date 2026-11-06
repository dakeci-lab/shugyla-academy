# Этап 27 — удалить старый планировщик закупа

Решение владельца (2026-11-03). Заказы поставщикам создаются только документом (`/procurement`, «＋ Создать»);
планирование — окно «Товары поставщика» (панель плана по графику поставщика). Старый планировщик `/procurement/plan` убран.

## Что сделано в коде (PR)
- Удалены `ProcurementPlannerView` (+css), `ProcurementPage`, `ProcurementStockHealthWidget`, их мёртвые утилиты и сервисы
  (`procurementPlanExport`, `procurementAttemptFingerprint`, `procurementPlannerColumnRegistry`, `plannerColumnLayout`,
  `plannerColumnSettingsMerge`, `tableSettings*`, `SearchableSupplierSelect`), неиспользуемые функции в
  `procurementPlannerUx` / `procurementPlanningService` / `procurementPlanningMath`.
- `/platform/procurement/plan` теперь перенаправляет на список «Закуп».
- Edge Function `umag-procurement`: убрано действие `generate` (оставлены `sync` и `refresh-supplier-stock`) — **нужен деплой**:
  GitHub Actions → «Deploy Supabase Edge Functions» → `functions = umag-procurement`.
- Удалены проверки `verify:*`, которые проверяли только планировщик (17 штук); остальные поправлены.

## Что остаётся владельцу (SQL Editor; `drop` через MCP не проходит)
Preflight (2026-11-03, prod): в телах функций `public` нет ссылок на `generate_procurement_orders_from_snapshot`; cron-задач с ней нет;
в коде и Edge Functions единственная ссылка была в `umag-procurement` (убрана этим PR).

```sql
begin;
drop function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text, uuid, text);
drop function public.generate_procurement_orders_from_snapshot(uuid, date, text, text);
commit;
```

Postcheck: `select count(*) from pg_proc where proname = 'generate_procurement_orders_from_snapshot';` → 0.

**Колонки `final_order_qty`, `manual_override`, `generated_purchase_order_id` в `procurement_snapshot_items` НЕ удалять:**
их читают `procurement_apply_plan` и `procurement_supplier_plan` (панель плана).

Опционально (отдельным решением): таблица `user_table_settings` (3 строки) — её читал только удалённый код настройки колонок планировщика.

## Что пропало для пользователя
Кнопка ручной полной синхронизации остатков из UMAG была только в старом планировщике. Остались: ночная синхронизация (07:00, `umag-procurement`),
обновление остатков одного поставщика кнопкой в окне «Товары поставщика» и расчёт плана cron-ом (`procurement-ensure-plan-every-minute`).

## Откат
Вернуть коммит из git (код) и функции из `supabase/migrations/` (последняя версия — по `verify-order-statuses`); данные не затрагивались.


**Выполнено:** на проде функции `generate_procurement_orders_from_snapshot` нет (проверено 2026-11-06, `pg_proc` → 0).
