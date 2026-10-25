# Откат этапа 24

Удалённое восстанавливается из истории репозитория; значения норм — из копии `docs/procurement/visit-days-redesign/norm-rules-backup-2026-10-25.csv`.

1. **Таблицы и функции норм:** создать заново по миграциям `supabase/migrations/*procurement_norm*` (таблицы `procurement_norm_rules`, `procurement_norm_changes`, триггер `procurement_norm_rules_journal`, функции
   `set_procurement_norm_rule_for_snapshot`, `get_procurement_norm_taxonomy`), загрузить правила из CSV.
2. **Колонки позиций снимка:** `alter table procurement_snapshot_items add column norm_days integer not null default 14` и т.д. по миграциям `procurement_abc_analysis` и
   `procurement_snapshot_items_reserve_status`. Значения ABC и норм восстановит ближайшая синхронизация (их вычисляла функция), поэтому для старых снимков они останутся пустыми.
3. **Права:** `insert into permissions (code, ...) values ('procurement.norms.manage', ...)` по миграции `20261017180000_procurement_norms_manage_permission.sql` и выдать директору.
4. Функции `procurement_snapshot_items_guard_update` и `compute_procurement_snapshot_rollup` вернуть к прежним определениям из git.
5. Редеплой прежних версий функций `umag-procurement` и `procurement-archive` (workflow «Deploy Supabase Edge Functions»).
