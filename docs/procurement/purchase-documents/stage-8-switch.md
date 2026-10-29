# Этап 8 — переключение на документы

- Меню «Закупки»: Закуп → список документов (`/platform/procurement`), Заказы, Расчёты, Склад. Адрес `/procurement/documents` перенаправляет на `/procurement`; документ — `/procurement/documents/:id` (у приёмщика — `/orders/:id`).
- Удалены: старая карточка заказа (`PurchaseDetailPage`), `PurchaseItemsTable`, `PurchaseItemForm`, `CreatePurchaseForm`, `PurchaseStatusBadge`, стили. Проверки переписаны под новую страницу.
- Старый планировщик (`ProcurementPage` + `ProcurementPlannerView`) оставлен только на `/platform/procurement/plan` на переходный период (неделя); в меню его нет.

## Что остаётся после недели наблюдений

1. Удалить маршрут `/procurement/plan`, `ProcurementPage`, `ProcurementPlannerView` и связанные компоненты/сервисы (`generateProcurementOrders`, правка итогового количества, `ProcurementStockHealthWidget`, …) вместе с проверками.
2. БД (выполняет владелец в SQL Editor, одной транзакцией, без `CASCADE`): удалить `generate_procurement_orders_from_snapshot` и неиспользуемые колонки/функции правки итогового количества. Перед этим — поиск по телам функций и по коду (`.from('…')`, `rpc('…')`), как в `docs/db/stage-25c-remove-receiving/`.
3. Дни заказа/доставки у 133 поставщиков заполняет закупщик (от этого зависит «цель запаса»).

Проверка: `npm run verify:purchase-documents-switch`. БД не менялась. Откат: revert PR.
