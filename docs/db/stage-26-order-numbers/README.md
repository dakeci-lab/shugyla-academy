# Stage 26 — номер документа заказа (этап 1 плана «Закуп как документы»)

Применено на проде 2026-10-29: `supabase/migrations/20261029120000_order_numbers.sql` (добавочная).

- Колонка `purchase_orders.number`, последовательность `purchase_order_number_seq` с 1001, уникальный индекс по номеру.
- Триггер `purchase_orders_assign_number` (до вставки или смены статуса): заказ получает номер, когда становится `saved` — любым путём («Сохранить», создание из плана). Номер не меняется и не переиспользуется; «Отменить» (→ черновик) номер сохраняет. Черновик номера не имеет.
- 949 уже сохранённых заказов пронумерованы 1001…1949 по дате создания; следующий номер 1950.
- Интерфейс: колонка «Номер» в списке «Заказы», «Заказ №N» в карточке, «Заказ поставщику №N» в PDF, строка «Номер заказа» в Excel, номер в имени файла.

Проверка: `select count(*) filter (where status='saved' and number is null) from purchase_orders;` → 0; `select count(*) from purchase_orders where number is not null;` = числу сохранённых.
Откат: `drop trigger purchase_orders_assign_number on purchase_orders; drop function purchase_orders_assign_number(); drop index purchase_orders_number_key; drop sequence purchase_order_number_seq; alter table purchase_orders drop column number;` (выполняет владелец).
Примечание: проверка триггера в транзакции с откатом сжигает значения последовательности (откат их не возвращает) — после проверки последовательность выровнена `setval` по максимальному номеру.
