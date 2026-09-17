-- Remove the «Акт сверки» (supplier reconciliation act) feature entirely.
--
-- Confirmed before writing this migration: zero reconciliation acts were
-- ever created in production (supplier_reconciliations, 0 rows), zero
-- documents were ever attached (supplier_reconciliation_documents, 0 rows),
-- and zero files were ever uploaded to the storage bucket. The feature was
-- built speculatively and never used — safe to remove with no data loss.
--
-- Everything else in «Взаиморасчёты» (payment/receiving/return history,
-- native "Оплачено" marking) is untouched — this migration only touches
-- tables and permissions dedicated to the reconciliation-act feature itself.

-- ---------------------------------------------------------------------------
-- Storage: policies dropped here (making the bucket fully inert — no
-- authenticated user can read or write it anymore). The empty bucket row
-- itself (0 objects, confirmed before this migration) is removed separately
-- via the Storage API/Dashboard — Postgres blocks direct DELETE on
-- storage.objects/storage.buckets (storage.protect_delete()).
-- ---------------------------------------------------------------------------

drop policy if exists supplier_recon_docs_storage_select on storage.objects;
drop policy if exists supplier_recon_docs_storage_insert on storage.objects;

-- ---------------------------------------------------------------------------
-- supplier_reconciliation_documents
-- ---------------------------------------------------------------------------

drop policy if exists supplier_reconciliation_documents_select on public.supplier_reconciliation_documents;
drop policy if exists supplier_reconciliation_documents_insert on public.supplier_reconciliation_documents;

drop table if exists public.supplier_reconciliation_documents;

-- ---------------------------------------------------------------------------
-- supplier_reconciliations
-- ---------------------------------------------------------------------------

drop policy if exists supplier_reconciliations_select on public.supplier_reconciliations;
drop policy if exists supplier_reconciliations_insert on public.supplier_reconciliations;
drop policy if exists supplier_reconciliations_update on public.supplier_reconciliations;

drop trigger if exists supplier_reconciliations_updated_at on public.supplier_reconciliations;

drop table if exists public.supplier_reconciliations;

-- ---------------------------------------------------------------------------
-- Permissions (view/create/edit/resolve) — explicit delete, not relying on
-- an FK cascade, so this is correct regardless of role_permissions' own
-- ON DELETE behavior.
-- ---------------------------------------------------------------------------

delete from public.role_permissions
where permission_id in (
  select id from public.permissions
  where code in (
    'umag.reconciliations.view',
    'umag.reconciliations.create',
    'umag.reconciliations.edit',
    'umag.reconciliations.resolve'
  )
);

delete from public.permissions
where code in (
  'umag.reconciliations.view',
  'umag.reconciliations.create',
  'umag.reconciliations.edit',
  'umag.reconciliations.resolve'
);
