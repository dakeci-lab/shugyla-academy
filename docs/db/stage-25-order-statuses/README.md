# Stage 25 — статусы заказа «Черновик / Сохранён»

Решение владельца 2026-10-28; схема — `docs/procurement/order-lifecycle/final-statuses.md`.

## 25a — аддитивная часть (применена 2026-10-28)
`supabase/migrations/20261028100000_order_statuses_rpc.sql`:
- RLS: правка заказа и его позиций разрешена для черновиков любого вида (старые `*_simple` политики остаются до 25b);
- `procurement_submit_order` (черновик → `saved`; пустой заказ и нулевые количества отклоняются; суммы пересчитываются);
- `procurement_unsave_order` (сохранён → черновик; снимает «Сверено»; количества в план не возвращает);
- `procurement_apply_plan`: «в пути» = заказы `saved` (и старые `awaiting_receiving/formed/sent/partially_received`) с датой доставки ≥ сегодня.

`supabase/migrations/20261028100100_order_delete_draft.sql` — `procurement_delete_draft_order` (содержит DELETE, выполняется владельцем в SQL Editor).

Проверка: `select proname from pg_proc where proname in ('procurement_unsave_order','procurement_submit_order','procurement_delete_draft_order');` → 3 строки; `select polname from pg_policy where polname like '%\_draft';` → 4 строки.

Откат: `drop function` трёх RPC и четырёх политик `*_draft`; тело `procurement_apply_plan` — из `20261025140000_visit_plan_async_ensure.sql`/предыдущей версии (условие `po.status not in ('cancelled','received')`).

## 25b — после выкладки интерфейса
Статусы `awaiting_receiving`/`received` → `saved`; удаление 20 `cancelled`; CHECK `status in ('draft','saved')`; создание заказа из планирования сразу `saved` без документов приёмки; удаление политик `*_simple`.

## 25c — удаление приёмки
Таблицы `receiving_*`, код, права, бакет `receiving-discrepancy-photos`.

## 25 UI (этот PR)
Интерфейс на два статуса: карточка заказа («Сохранить» / «Отменить» / «Удалить» черновик, правка позиций, даты и комментария только в черновике),
список «Заказы» (приёмщику — только «Сохранён»; закупщику — ещё черновики сверху, вне периода; «+ Новый заказ»),
старые статусы читаются как «Сохранён». Удалены: страница аналитических закупов, карточки-счётчики, история закупов, «Передать в приёмку».
`verify:order-statuses` заменил `verify:procurement-order-actions`.

## 25b (применено 2026-10-28)
Часть 1 (`20261028120000_order_statuses_cutover.sql`, без удалений, применена через MCP): заказы из «Закупа» создаются сразу `saved` без документов приёмки;
«в пути» — только `saved`; старые статусы → `saved` (939 заказов); `procurement_set_order_checked` — «Сверено» через серверную функцию
(находка: прямая запись отметки не проходила RLS для заказов из планирования — отмеченных заказов в базе не было ни одного).
Часть 2 (`20261028120100_order_statuses_cleanup.sql`, выполняет владелец в SQL Editor): удаление 20 отменённых, `CHECK (status in ('draft','saved'))`, снятие 5 старых `*_simple` политик.

Проверка после части 2: `select status, count(*) from purchase_orders group by 1;` → только `saved` (и `draft`); `select polname from pg_policy where polrelid in ('purchase_orders'::regclass,'purchase_order_items'::regclass);` → select, `insert_simple` (заказы), `update_draft`, три `*_draft` (позиции).
Откат части 2: вернуть политики из `20260812*`/этапа 7 (тексты в истории миграций) и `alter table purchase_orders drop constraint purchase_orders_status_check`; удалённые заказы — только из бэкапа.
