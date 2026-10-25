# ABC-анализ убран (2026-10-25)

**Откуда брались данные.** Ночная синхронизация закупа (`umag-procurement`, 07:00 по Актобе и кнопка в «Закуп») забирает из UMAG остатки и продажи за 8 недель, считает по каждому
товару выручку, себестоимость и прибыль и присваивает классы A/B/C по трём осям — количество (К), выручка (В), прибыль (П) — функцией `abcClassification.js`. Результат хранится в позициях
снимка (`abc_qty`, `abc_revenue`, `abc_profit`, `revenue_8w`, `cogs_8w`, `profit_8w`). Вкладка «ABC» и три колонки К/В/П в планировании только показывали эти поля.

**Что удалено из интерфейса:** вкладка «ABC», колонки К/В/П и их сортировка, фильтры и плашка «ABC недоступен», бейджи, `procurementAbc.js`, `AbcBadges`, чтение ABC в `procurementPlanningService`.

**Что остаётся (мёртвое, ничего не читает), удалить вместе с нормами при следующем деплое функции и интерактивном подтверждении удаления колонок:**
- Edge: `abcClassification.js` и вызов `assignSnapshotAbcClasses` в `umag-procurement`, колонки в списке `procurement-archive`;
- БД: `abc_qty`, `abc_revenue`, `abc_profit` в `procurement_snapshot_items` (+ индексы `idx_psi_snapshot_abc_*`); `revenue_8w`, `cogs_8w`, `profit_8w` пока нужны выбору позиций в снимке;
- миграция `20260815072607_procurement_abc_analysis.sql` и `docs/procurement/abc-analysis.md` остаются как история.
