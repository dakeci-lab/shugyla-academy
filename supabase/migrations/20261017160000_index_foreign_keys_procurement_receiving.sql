-- Stage 15d: indexes on foreign keys flagged by the Supabase performance advisor
-- (applied on prod 2026-10-17 via MCP as `index_foreign_keys_procurement_receiving`).
-- Measured: loading purchase_order_items for the 100 newest orders went from a sequential scan
-- (20 ms, grows with the table) to an index scan (10 ms). The tables are small, a plain CREATE INDEX is safe.
-- `academy_users.work_location_id` is intentionally not indexed (the column is slated for removal).
-- Rollback: drop index if exists <name>.

select pg_advisory_xact_lock(202610171003);

create index if not exists idx_purchase_order_items_purchase_order_id on public.purchase_order_items (purchase_order_id);
create index if not exists idx_purchase_order_items_supplier_id on public.purchase_order_items (supplier_id);
create index if not exists idx_purchase_orders_supplier_id on public.purchase_orders (supplier_id);

create index if not exists idx_receiving_items_receiving_document_id on public.receiving_items (receiving_document_id);
create index if not exists idx_receiving_items_purchase_order_item_id on public.receiving_items (purchase_order_item_id);
create index if not exists idx_receiving_documents_supplier_id on public.receiving_documents (supplier_id);
create index if not exists idx_receiving_documents_last_exported_by on public.receiving_documents (last_exported_by);
create index if not exists idx_receiving_document_versions_created_by on public.receiving_document_versions (created_by);
create index if not exists idx_receiving_umag_exports_generated_by on public.receiving_umag_exports (generated_by);

create index if not exists idx_spo_payment_account_id_snapshot on public.supplier_payment_obligations (payment_account_id_snapshot);
create index if not exists idx_spo_platform_paid_by on public.supplier_payment_obligations (platform_paid_by);
create index if not exists idx_spo_platform_payment_account_id on public.supplier_payment_obligations (platform_payment_account_id);
create index if not exists idx_spo_umag_supply_row_id on public.supplier_payment_obligations (umag_supply_row_id);

create index if not exists idx_supplier_umag_match_candidates_platform_supplier_id on public.supplier_umag_match_candidates (platform_supplier_id);
create index if not exists idx_umag_supply_items_umag_supply_row_id on public.umag_supply_items (umag_supply_row_id);
create index if not exists idx_umag_supply_return_items_umag_return_row_id on public.umag_supply_return_items (umag_return_row_id);

analyze public.purchase_order_items;
analyze public.purchase_orders;
analyze public.receiving_items;
analyze public.receiving_documents;
analyze public.supplier_payment_obligations;
