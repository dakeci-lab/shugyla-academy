# Этап 23 — план закупа по дням поставщика (в работе)

Замена норм по категориям на цель «срок доставки + цикл до следующей поставки + страховые дни» (решения владельца — `docs/procurement/visit-days-redesign/`).

**23a (применён на проде 2026-10-25, не меняет поведение приложения):** новые колонки `target_days`, `lead_days`, `cycle_days`, `in_transit_qty`,
`plan_basis` в `procurement_snapshot_items`; таблица `procurement_supplier_plans`; функции `procurement_weekdays`, `procurement_visit_params`,
`procurement_apply_plan`, `procurement_supplier_plan`, `procurement_plan_supplier`. Файл: `20261025120000_visit_plan_functions.sql`.

**23b (ещё не применён):** `reserve_status` из вычисляемой колонки в обычную, триггер «снимок готов → пересчёт плана», новая сводка
`get_procurement_snapshot_stock_health`, первичный пересчёт последнего снимка. Применяется вместе со слиянием нового экрана планирования.
Пробный прогон 23b на проде завис по таймауту — перед применением проверить состояние таблицы и сессий.

**Откат 23a:** `drop function` пяти функций, `drop table procurement_supplier_plans`, `alter table procurement_snapshot_items drop column` пяти колонок.
