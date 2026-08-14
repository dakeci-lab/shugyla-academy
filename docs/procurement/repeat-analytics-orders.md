# Repeat analytics purchase orders

Дата: 2026-08-14
Ветка: `agent/procurement-repeat-orders-backend`
Миграция: `supabase/migrations/20260814134910_procurement_repeat_analytics_orders.sql`

## Preflight

- Новый migration-файл создан через `npx supabase migration new procurement_repeat_analytics_orders`.
- `apply_migration` не используется.
- AGENTS.md в репозитории нет; ориентир — CLAUDE.md + официальные docs Supabase (SECURITY DEFINER, `search_path = ''`, grants, USING + WITH CHECK, не `auth.role()`).
- Прод (факт 2026-08-14, без `db push`): `[db.migrations] enabled = false`, поэтому SQL применили `npx supabase db query --linked --file supabase/migrations/20260814134910_procurement_repeat_analytics_orders.sql`, историю записали `npx supabase migration repair --linked --status applied 20260814134910`, затем Edge `npx supabase functions deploy umag-procurement --project-ref cxadzerxndlscwvdaymk`, затем push в `main` → `.github/workflows/deploy-ps-production.yml` → ветка `ps-production`. Academy Docker volume не сбрасывать.

## Root cause

Генерация считала «уже заказано» по двум эксклюзивным замкам:

1. `uq_purchase_orders_snapshot_revision_supplier` — один analytics-заказ на снимок + revision + поставщика.
2. `generated_purchase_order_id` на planning-строке — после первого заказа qty нельзя было менять, RPC больше не брал эту строку.

Журнал уже был в `purchase_order_items`. Отдельная allocations-таблица не нужна.

## Контракт

- Одна planning-строка на `unique(snapshot_id, barcode)`.
- Тот же SKU можно сознательно заказать неограниченное число раз тому же поставщику в том же снимке.
- После успешного заказа `final_order_qty = 0`, `manual_override = true`. История — в `purchase_order_items`.
  Override остаётся `true` сознательно: `applyNormDaysChange` / `set_procurement_norm_rule_for_snapshot` перезаписывают `final_order_qty` из рекомендации, когда override = false. Ноль после заказа — это потреблённый план, а не «следовать рекомендации».
- `cancelled` не считается «заказано» и отпускает SKU для повторного заказа. `procurement_cancel_order` восстанавливает `final_order_qty` из позиций отменённого заказа, только если указатель всё ещё на этот заказ и текущее qty = 0, затем снимает `generated_purchase_order_id`.
- `draft` / `formed` / `sent` / `awaiting_receiving` / `partially_received` / `received` продолжают считаться.
- Каждый новый заказ пишет свои `purchase_order_items` и отдельный `receiving_documents`.
- Пустой заказ не создаётся.
- Тот же `attempt_key` = тот же заказ. Новый ключ = новый заказ.
- Тот же ключ с другим payload fingerprint = `attempt_key payload conflict` (409).
- Клиент без `attempt_key` получает стабильный legacy-ключ на `(snapshot, revision, supplier)`. Повтор активного заказа идемпотентен. После cancel уникальный индекс не держит cancelled-строку, поэтому legacy-клиент может создать новый заказ, а не бесконечно реплеить отменённый.
- Same SKU у другого поставщика вне scope: fact snapshot не меняется.

## RLS / grants

Прямые `INSERT`/`UPDATE`/`DELETE` от `authenticated` — только `workflow_mode = 'simple'`. Analytics-документы создаёт `service_role` generate RPC.

Переходы статуса analytics (`draft` / `cancelled`) — только SECURITY DEFINER `procurement_return_order_to_draft` / `procurement_cancel_order`. Старый broad `purchase_orders_update_active_employee` снят: иначе любой active employee мог перевести analytics в `draft` и обойти item policies.

Складская приёмка analytics идёт через `receiving_start_v1` / `receiving_save_v1` / `receiving_complete_v1` (тоже SECURITY DEFINER). Прямые мутации `receiving_documents` / `receiving_items` для analytics закрыты.

Table-level `INSERT`/`UPDATE` на `purchase_orders`, `purchase_order_items`, `receiving_documents`, `receiving_items` отозваны. Колоночные `GRANT INSERT` и `GRANT UPDATE` выданы отдельно и не включают `attempt_key`, `generation_payload_fingerprint`, `source_snapshot_id`, `source_snapshot_revision`. Column `REVOKE` при table-level UPDATE не работает.

## RPC

```
generate_procurement_orders_from_snapshot(
  p_snapshot_id uuid,
  p_expected_delivery_date date,
  p_supplier_ids uuid[],
  p_created_by text default null,
  p_created_by_name text default null,
  p_attempt_key uuid default null,
  p_payload_fingerprint text default null
) returns jsonb
```

service_role only. Старая 4-аргументная сигнатура по-прежнему отказывает без поставщика.

Явный `attempt_key` **требует** client fingerprint. Дыры `null` нет. Legacy-клиент опускает оба поля.

### Payload fingerprint

Канонический текст, не hash. JS и SQL должны совпасть байт-в-байт. Спека `shugyla.procurement.attempt.fp.v1`:

```
shugyla.procurement.attempt.fp.v1
snapshot=<uuid lowercase>
supplier=<uuid lowercase>
date=<YYYY-MM-DD>
<barcode>=<canonicalQty>
```

Строки товаров — barcodes UTF-8 ascending, только qty > 0. Qty: `round(numeric, 3)`, затем trim trailing `0` и `.`. Модуль: `src/utils/procurementAttemptFingerprint.js`. Фикстура `ATTEMPT_FINGERPRINT_FIXTURE` общая для JS verify и live SQL.

Клиент считает fingerprint один раз от точного submit payload (snapshot, supplier, date, sorted barcode + normalized qty) и хранит его вместе с `attemptKey`. Retry сети шлёт ту же пару, даже если экранное qty уже изменилось. Сервер:

- CREATE: client fingerprint === fingerprint от locked items.
- REPLAY: client fingerprint === stored fingerprint (qty к этому моменту уже 0).

Same key после потери ответа / server unique race — replay того же заказа. Same key с другим составом — 409.

### Ответ

```
{
  success,
  already_generated,          // 0 создано и был replay
  idempotent_replay,
  nothing_to_order,           // qty=0 и это не replay
  snapshot_id,
  snapshot_revision,
  snapshot_status,            // ready | partially_generated | generated
  requested_supplier_ids,
  attempt_key,
  payload_fingerprint,
  purchase_order_ids,         // только заказы, созданные или replayed этой попыткой
  receiving_document_ids,     // только receiving этой попытки
  orders_created,
  orders_existing,
  skipped_no_supplier,
  items_ordered,
  remaining_suppliers         // итог по снимку: поставщики с current qty > 0
}
```

`purchase_order_ids` / `receiving_document_ids` накапливаются `array_append` внутри цикла поставщиков. Итоги снимка (`snapshot_status`, `remaining_suppliers`) считаются отдельно и не подменяют ID этой попытки.

Ошибки: `attempt_key payload conflict`, `attempt_key requires payload fingerprint`, `attempt_key requires a single supplier`, `cannot create an order without items`, `supplier selection is required`.

## Lock order

`generate` берёт snapshot `FOR UPDATE`, затем items `FOR UPDATE`. Guard `procurement_snapshot_items_guard_update` читает `status` **без** row lock. `FOR SHARE` на snapshot после item UPDATE инвертировал глобальный порядок и давал deadlock.

## Frontend / Claude interface

Файл: `src/services/procurementPlanningService.js`

```
generateProcurementOrders(snapshotId, expectedDeliveryDate, {
  supplierId,            // один поставщик, если передаёте attemptKey
  supplierIds,           // legacy: несколько без attemptKey
  attemptKey,            // crypto.randomUUID() на сознательный клик; тот же UUID на HTTP retry
  payloadFingerprint,    // обязателен вместе с attemptKey; канонический текст spec v1
})

→ {
  success, alreadyGenerated, idempotentReplay, nothingToOrder,
  purchaseOrderIds, receivingDocumentIds,
  ordersCreated, ordersExisting, itemsOrdered,
  snapshotStatus, remainingSuppliers, requestedSupplierIds,
  attemptKey, payloadFingerprint
}

fetchSnapshotSkuOrderHistory(snapshotId, barcode)
→ [{
  purchaseOrderId, barcode, productName, orderedQty, purchasePrice, totalAmount,
  createdAt, status, supplierId, supplierName, attemptKey, expectedDeliveryDate,
  countsAsOrdered   // false только для cancelled
}]
```

Edge `umag-procurement` action `generate` принимает `attemptKey` / `attempt_key` и `payloadFingerprint` / `payload_fingerprint`. Prefix `shugyla.procurement.attempt.fp.v1\n` проверяется без lowercase.

**Нельзя:**

- Блокировать ввод qty по `generatedPurchaseOrderId`.
- Считать `generated_purchase_order_id` полной историей.
- Повторно использовать `attemptKey` после успешного сознательного заказа.
- Считать cancelled заказ в «уже заказано».
- Тостить «создано 0» со старым ID. `nothingToOrder` — warning без ссылки. `idempotentReplay` — «уже был создан» с ID этой попытки.

**Нужно:**

- После успеха показать current qty = 0 и историю отдельно.
- На retry сети слать ту же пару `attemptKey` + fingerprint.
- На новую попытку — новый UUID и fingerprint от актуального payload.
- Fallback истории при pointer + qty 0: «Заказано · 1 документ», без «0 шт.».

## Frontend integration

- Planner `begin(payload)` возвращает `{ key, fingerprint }` и retain-ит оба на retry.
- `fetchSnapshotAttemptItems` читает полный состав поставщика (не одну страницу) перед первым submit.
- `fetchSnapshotItemsPage` вешает на каждую видимую строку `orderedQtyTotal` / `orderedDocumentCount` одним batched-запросом по barcode страницы (`cancelled` исключается). Это не N+1; `fetchSnapshotSkuOrderHistory` остаётся журналом одной SKU.
- `unassignedOnly` — точный фильтр `.is('platform_supplier_id', null)`.
- Снимок со статусом `generated` остаётся редактируемым (`isSnapshotQuantityEditable`).
- `FILTER_OPTIONS_CACHE_VERSION` не бампали: форма скана фильтров не менялась. Новый pending после прошлого заказа — не «расхождение».

## Backfill

Окно `row_number()` по `(snapshot, revision, supplier)`, сначала live (не cancelled), затем `created_at, id`. Ключ ставится только первой строке окна и только если этот legacy-ключ ещё не держит другая live-строка. Инвариант: не больше одного non-cancelled analytics-заказа на legacy-ключ.

## Проверки

```
npm run verify:procurement-repeat-analytics-orders          # static lint
npm run verify:procurement-repeat-orders-ui
npm run supabase:local:verify-procurement-repeat-analytics-orders
npm run verify:procurement-planning-v1
npm run verify:procurement-partial-generation
npm run verify:procurement-order-actions
npm run verify:procurement-snapshot-guard-static
npm run verify:procurement-desktop-ux
npm run verify:procurement-mobile-access
npm run verify:procurement-cross-device-sync
npm run verify:procurement-calendar-filter
npm run verify:procurement-pagination-ux
npm run verify:procurement-norms-ui
npm run verify:receiving-v1-foundation
npm run build
```

`verify:procurement-snapshot-guard-static` по-прежнему читает старый файл `20260812032500_*` (там FOR SHARE). Инвариант «без FOR SHARE» живёт в repeat-analytics verify.

Live, 2026-08-14: **103 checks passed** (generate / replay / cancel / concurrency / RLS) на изолированной scratch-Postgres. Academy volume не сбрасывали. Verify по умолчанию смотрит на `shugyla-academy`; scratch выбирался только runtime-env `SUPABASE_PROJECT_ID`.

Полный timestamp chain с нуля на пустой БД не встаёт — это старые файлы, не этот контракт:

- без `schema.sql` падает `20260712163000` (`alter table academy_users add column if not exists role_id uuid`);
- после `schema.sql` падает `20260716220000_fix_time_tracker_checkout_after_rls.sql` (нет geo / `platform_get_employee_work_location`; CLI пропускает named `add_*.sql`);
- дальше data-dependent `20260801124500` и `20260812085722`.

Scratch-only baseline: named purchase/geo SQL + fixture, затем отдельно `20260812171700`, `20260813231600` и эта миграция.

Targeted: static 37, UI 69/69, order-actions 95, snapshot-guard-static 14, `npm run build` зелёный.

Прод после этого: SQL `20260814134910` записан в `schema_migrations`, Edge `umag-procurement` задеплоен, фронт `e74724c` ушёл в `main`. GHA `deploy-ps-production` run [31826694354](https://github.com/dakeci-lab/shugyla-academy/actions/runs/31826694354) success. `https://web.shugyla-market.kz/version.json` → `"commit": "e74724ced99f7b4259371066aafcd777d4d673e7"`.

## Residual risks

- Edge с новыми параметрами RPC нельзя выкатывать раньше миграции.
- После `procurement_return_order_to_draft` клиент больше не может править analytics items напрямую (simple-only RLS). Правка состава analytics-черновика потребует отдельный SECURITY DEFINER RPC.
- Legacy-клиент без fingerprint не ловит same-key/different-qty conflict; защита — только envelope (snapshot/supplier/date) плюс status-aware unique.
- `generated_purchase_order_id` остаётся указателем на последний заказ; старый UI, который по нему прячет редактор, будет выглядеть «замороженным», пока фронт не перестанет на него опираться.
- Сортировка barcode в fingerprint зависит от collation Postgres vs JS UTF-16; для ASCII-штрихкодов совпадает.
