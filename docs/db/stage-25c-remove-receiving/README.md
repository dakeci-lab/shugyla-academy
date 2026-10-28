# Stage 25c — удаление приёмки

Решение владельца 2026-10-28: приёмка в платформе не нужна (приёмщик ставит галочки в списке «Заказы», статуса приёмки нет).

## Порядок
1. **PR «remove receiving» → деплой.** Из приложения убраны: сервисы и адаптеры приёмки, модуль `receiving` кэша, realtime-подписки на `receiving_*`,
   оптимистичный слой, поля заказа `transferredToReceiving` / `receivingDocumentId`, мёртвые статусы. Остаются два статуса (`draft`, `saved`) и право `receiving.view` («Просмотр заказов»).
2. **Часть 1 (MCP, добавочная)** — `20261028140000_order_rpc_without_receiving.sql`: «Сохранить» и «Отменить» не трогают документы приёмки.
3. **Часть 2 (владелец, SQL Editor, после деплоя)** — `20261028140100_remove_receiving.sql`: функция удаления черновика без приёмки; 3 политики бакета фото; 4 таблицы
   (`receiving_umag_exports` 2 строки, `receiving_document_versions` 10, `receiving_items` ~9,7 тыс., `receiving_documents` ~950); 11 функций; колонки `purchase_orders.transferred_to_receiving`, `receiving_document_id`.
   Бакет `receiving-discrepancy-photos` пуст (0 объектов) — удаляется в панели Storage (прямое удаление из SQL запрещено).

## Preflight (выполнен 2026-10-28)
- Код приложения и Edge Functions: `grep receiving_` — в функциях только комментарий (`umag-procurement`), в приложении ссылки убраны этим PR.
- Зависимости таблиц: только собственные ограничения, 12 политик, 3 политики бакета, триггеры, публикация realtime (2 таблицы); представлений нет.
- Заказы без привязки к документам приёмки: колонки в коде не используются.

## Postcheck
```sql
select count(*) from pg_class where relname like 'receiving\_%' and relkind = 'r';                       -- 0
select count(*) from pg_proc where proname like 'receiving\_%' or proname in ('procurement_cancel_order','procurement_return_order_to_draft'); -- 0
select column_name from information_schema.columns where table_name = 'purchase_orders' and column_name in ('transferred_to_receiving','receiving_document_id'); -- пусто
select status, count(*) from purchase_orders group by 1;                                                -- только draft / saved
```

## Откат
Удалённые таблицы восстанавливаются только из резервной копии Supabase (Database → Backups). Данных приёмки в других местах нет. Миграции создания — в истории `supabase/migrations/*receiving*`.
