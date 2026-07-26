-- Supplier reconciliation acts (акты сверки) — stage 2 settlements
-- Single-tenant; UMAG source data remains read-only.

select pg_advisory_xact_lock(202607262400);

-- Permissions
insert into public.permissions (code, name, module, sort_order)
values
  ('umag.reconciliations.view', 'Просмотр актов сверки', 'umag', 180),
  ('umag.reconciliations.create', 'Создание актов сверки', 'umag', 181),
  ('umag.reconciliations.edit', 'Редактирование актов сверки', 'umag', 182),
  ('umag.reconciliations.resolve', 'Закрытие расхождений сверки', 'umag', 183)
on conflict (code) do update
set
  name = excluded.name,
  module = excluded.module,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'admin'
  and p.code in (
    'umag.reconciliations.view',
    'umag.reconciliations.create',
    'umag.reconciliations.edit',
    'umag.reconciliations.resolve'
  )
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- supplier_reconciliations
-- ---------------------------------------------------------------------------

create table if not exists public.supplier_reconciliations (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid null references public.umag_suppliers (id) on delete set null,
  umag_supplier_id bigint null,
  supplier_name text not null default '',
  date_from date not null,
  date_to date not null,
  status text not null default 'draft',
  umag_supply_count integer not null default 0,
  umag_supply_amount numeric(20, 4) not null default 0,
  umag_payment_amount numeric(20, 4) not null default 0,
  umag_payment_refund_amount numeric(20, 4) not null default 0,
  umag_debt numeric(20, 4) not null default 0,
  supplier_reported_balance numeric(20, 4) null,
  difference numeric(20, 4) null,
  comment text null,
  resolution_note text null,
  snapshot_synced_at timestamptz null,
  snapshot_last_umag_sync_id uuid null references public.umag_sync_runs (id) on delete set null,
  created_by bigint null references public.academy_users (id) on delete set null,
  updated_by bigint null references public.academy_users (id) on delete set null,
  closed_by bigint null references public.academy_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null,
  constraint supplier_reconciliations_status_check check (
    status in ('draft', 'matched', 'discrepancy', 'resolved')
  ),
  constraint supplier_reconciliations_period_check check (date_from <= date_to)
);

create index if not exists idx_supplier_reconciliations_supplier_id
  on public.supplier_reconciliations (supplier_id);
create index if not exists idx_supplier_reconciliations_umag_supplier_id
  on public.supplier_reconciliations (umag_supplier_id);
create index if not exists idx_supplier_reconciliations_period
  on public.supplier_reconciliations (date_from, date_to);
create index if not exists idx_supplier_reconciliations_status
  on public.supplier_reconciliations (status);
create index if not exists idx_supplier_reconciliations_created_at
  on public.supplier_reconciliations (created_at desc);

comment on table public.supplier_reconciliations is
  'Supplier reconciliation acts with immutable UMAG period snapshots at creation time.';

drop trigger if exists supplier_reconciliations_updated_at on public.supplier_reconciliations;
create trigger supplier_reconciliations_updated_at
  before update on public.supplier_reconciliations
  for each row
  execute function public.academy_set_updated_at();

alter table public.supplier_reconciliations enable row level security;

revoke all on table public.supplier_reconciliations from public;
revoke all on table public.supplier_reconciliations from anon;
revoke all on table public.supplier_reconciliations from authenticated;
grant select, insert, update on table public.supplier_reconciliations to authenticated;
grant all on table public.supplier_reconciliations to service_role;

drop policy if exists supplier_reconciliations_select on public.supplier_reconciliations;
create policy supplier_reconciliations_select
  on public.supplier_reconciliations
  for select
  to authenticated
  using (auth_private.current_user_has_permission('umag.reconciliations.view'));

drop policy if exists supplier_reconciliations_insert on public.supplier_reconciliations;
create policy supplier_reconciliations_insert
  on public.supplier_reconciliations
  for insert
  to authenticated
  with check (auth_private.current_user_has_permission('umag.reconciliations.create'));

drop policy if exists supplier_reconciliations_update on public.supplier_reconciliations;
create policy supplier_reconciliations_update
  on public.supplier_reconciliations
  for update
  to authenticated
  using (
    auth_private.current_user_has_permission('umag.reconciliations.edit')
    or auth_private.current_user_has_permission('umag.reconciliations.resolve')
  )
  with check (
    auth_private.current_user_has_permission('umag.reconciliations.edit')
    or auth_private.current_user_has_permission('umag.reconciliations.resolve')
  );

-- ---------------------------------------------------------------------------
-- supplier_reconciliation_documents
-- ---------------------------------------------------------------------------

create table if not exists public.supplier_reconciliation_documents (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null
    references public.supplier_reconciliations (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  uploaded_by bigint null references public.academy_users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint supplier_reconciliation_documents_path_not_empty
    check (char_length(trim(storage_path)) > 0),
  constraint supplier_reconciliation_documents_name_not_empty
    check (char_length(trim(file_name)) > 0),
  constraint supplier_reconciliation_documents_size_positive
    check (size_bytes >= 0)
);

create index if not exists idx_supplier_reconciliation_documents_recon
  on public.supplier_reconciliation_documents (reconciliation_id);

comment on table public.supplier_reconciliation_documents is
  'Metadata for private Storage files attached to supplier reconciliations.';

alter table public.supplier_reconciliation_documents enable row level security;

revoke all on table public.supplier_reconciliation_documents from public;
revoke all on table public.supplier_reconciliation_documents from anon;
revoke all on table public.supplier_reconciliation_documents from authenticated;
grant select, insert on table public.supplier_reconciliation_documents to authenticated;
grant all on table public.supplier_reconciliation_documents to service_role;

drop policy if exists supplier_reconciliation_documents_select on public.supplier_reconciliation_documents;
create policy supplier_reconciliation_documents_select
  on public.supplier_reconciliation_documents
  for select
  to authenticated
  using (auth_private.current_user_has_permission('umag.reconciliations.view'));

drop policy if exists supplier_reconciliation_documents_insert on public.supplier_reconciliation_documents;
create policy supplier_reconciliation_documents_insert
  on public.supplier_reconciliation_documents
  for insert
  to authenticated
  with check (
    auth_private.current_user_has_permission('umag.reconciliations.create')
    or auth_private.current_user_has_permission('umag.reconciliations.edit')
  );

-- ---------------------------------------------------------------------------
-- Private Storage bucket
-- Path: reconciliations/{reconciliation_id}/{filename}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'supplier-reconciliation-docs',
  'supplier-reconciliation-docs',
  false,
  15728640,
  array[
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists supplier_recon_docs_storage_select on storage.objects;
create policy supplier_recon_docs_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'supplier-reconciliation-docs'
    and auth_private.current_user_has_permission('umag.reconciliations.view')
  );

drop policy if exists supplier_recon_docs_storage_insert on storage.objects;
create policy supplier_recon_docs_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'supplier-reconciliation-docs'
    and (storage.foldername(name))[1] = 'reconciliations'
    and (
      auth_private.current_user_has_permission('umag.reconciliations.create')
      or auth_private.current_user_has_permission('umag.reconciliations.edit')
    )
  );
