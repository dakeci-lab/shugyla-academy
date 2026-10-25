# Этап 23 — план закупа по дням поставщика (в работе)

Замена норм по категориям на цель «срок доставки + цикл до следующей поставки + страховые дни» (решения владельца — `docs/procurement/visit-days-redesign/`).

**23a (применён на проде 2026-10-25, не меняет поведение приложения):** новые колонки `target_days`, `lead_days`, `cycle_days`, `in_transit_qty`,
`plan_basis` в `procurement_snapshot_items`; таблица `procurement_supplier_plans`; функции `procurement_weekdays`, `procurement_visit_params`,
`procurement_apply_plan`, `procurement_supplier_plan`, `procurement_plan_supplier`. Файл: `20261025120000_visit_plan_functions.sql`.

**23b (применён на проде 2026-10-25):** новая колонка `plan_status` (старую вычисляемую `reserve_status` не удаляем — удаление колонки требует интерактивного подтверждения; уберём вместе с нормами), триггер «снимок готов → пересчёт плана», сводка `get_procurement_snapshot_stock_health` из `plan_status`, первичный пересчёт последнего снимка (8 602 позиции; к заказу 1 652 позиции, 16 598 ед. — совпало с пробным расчётом). Файл: `20261025130000_visit_plan_cutover.sql`.

**Откат 23b:** `drop trigger trg_procurement_snapshot_ready_plan`, вернуть прежнее тело `get_procurement_snapshot_stock_health` (на `reserve_status`/`norm_days`), `drop column plan_status`. Старые `recommended_qty` после отката пересчитает ближайшая ночная синхронизация.

**Откат 23a:** `drop function` пяти функций, `drop table procurement_supplier_plans`, `alter table procurement_snapshot_items drop column` пяти колонок.

## Пробный расчёт на последнем снимке (только чтение, 2026-10-25, воскресенье)

| | Поставщики с днями (visit_days) | Без дней (цикл 7) |
|---|---|---|
| позиций к заказу сейчас → по новой логике | 2 086 → 1 180 | 900 → 472 |
| единиц к заказу | 17 687 → 8 416 | 6 789 → 8 182 |
| средняя цель | 11 дн. | 9 дн. |

Для поставщиков с днями рекомендация почти вдвое меньше по единицам. Цель зависит от дня недели: в воскресенье до среды 3 дня доставки.

## Нормы из интерфейса убраны (PR «remove norms UI»)

Удалены вкладка «Нормы», сервисы и кэш норм, право `procurement.norms.manage` из каталога прав, формулы норм из `procurementPlanningMath`.
**В базе и в Edge-функции пока остаются** (мёртвые, ничего не читают): `procurement_norm_rules` (копия — `docs/procurement/visit-days-redesign/norm-rules-backup-2026-10-25.csv`),
`procurement_norm_changes`, `norm_days` и вычисляемая `reserve_status` в позициях снимка, функции `set_procurement_norm_rule_for_snapshot`, `get_procurement_norm_taxonomy`,
`procurement_norm_rules_journal`, действие `set_norm` и чтение правил в `umag-procurement`. Удаляем отдельным этапом, когда будет деплой функции
и интерактивное подтверждение удалений (MCP не даёт делать `drop` без него).

## Правка 2026-10-25 (после первого просмотра экрана)

Если сегодня день заказа поставщика и он же день доставки (заказ и доставка в воскресенье), доставка считается в тот же день (срок 0), а не через неделю.
Было: «Игрушка» в воскресенье показывала срок 7 и цель 15 дней; стало срок 0 и цель 8. Функция `procurement_visit_params` пересоздана на проде, снимок пересчитан.

## 23c — план считается вне оператора «снимок готов» (2026-10-25, найдено на первой живой синхронизации)

Триггер на статусе `ready` считал план внутри обновления снимка. Первый полный расчёт занимает ~6 с, а у API-роли лимит 8 с (`authenticator statement_timeout=8s`), поэтому
синхронизация падала: «Снимок создан, но не удалось отметить как готовый». Исправлено:
- защитный триггер позиций пропускает построчные проверки при флаге `app.items_guard_skip` (проверки на 8,6 тыс. строк стоили ~2 с);
- `procurement_apply_plan` переписан (повторный запуск 0,15 с, первый 4–6 с, меняет только изменившиеся строки);
- триггер «ready» теперь пустой; план считает cron `procurement-ensure-plan-every-minute` (раз в минуту) и планировщик сразу после ручной синхронизации (`procurement_ensure_plan`).
Файл: `20261025140000_visit_plan_async_ensure.sql`. Откат: вернуть прежнее тело триггера `ready` (вызов `procurement_apply_plan`), `select cron.unschedule('procurement-ensure-plan-every-minute')`.
