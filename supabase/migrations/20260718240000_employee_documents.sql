-- Employee documents: metadata table + private Storage bucket + RLS

select pg_advisory_xact_lock(202607182400);

-- ---------------------------------------------------------------------------
-- Permission helper (admin / employees.view)
-- ---------------------------------------------------------------------------

create or replace function auth_private.current_user_has_permission(p_permission_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and (
      exists (
        select 1
        from public.academy_users au
        join public.role_permissions rp on rp.role_id = au.role_id
        join public.permissions p on p.id = rp.permission_id
        where au.auth_user_id = auth.uid()
          and au.status = 'active'
          and p.code = p_permission_code
      )
      or exists (
        select 1
        from public.academy_users au
        where au.auth_user_id = auth.uid()
          and au.status = 'active'
          and au.role = 'admin'
      )
    );
$$;

comment on function auth_private.current_user_has_permission(text) is
  'True when the authenticated employee has the given permission code or is admin.';

revoke all on function auth_private.current_user_has_permission(text) from public;
revoke all on function auth_private.current_user_has_permission(text) from anon;
grant execute on function auth_private.current_user_has_permission(text) to authenticated;
grant execute on function auth_private.current_user_has_permission(text) to service_role;

-- ---------------------------------------------------------------------------
-- Metadata table
-- ---------------------------------------------------------------------------

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references public.academy_users (id) on delete cascade,
  document_type text not null,
  storage_path text not null,
  file_name text null,
  content_type text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_documents_type_not_empty check (char_length(trim(document_type)) > 0),
  constraint employee_documents_path_not_empty check (char_length(trim(storage_path)) > 0),
  constraint employee_documents_employee_type_unique unique (employee_id, document_type)
);

create index if not exists idx_employee_documents_employee_id
  on public.employee_documents (employee_id);

comment on table public.employee_documents is
  'Employee HR document metadata. Binary files live in private Storage bucket employee-documents.';

drop trigger if exists employee_documents_updated_at on public.employee_documents;
create trigger employee_documents_updated_at
  before update on public.employee_documents
  for each row
  execute function public.academy_set_updated_at();

alter table public.employee_documents enable row level security;

revoke all on table public.employee_documents from public;
revoke all on table public.employee_documents from anon;
revoke all on table public.employee_documents from authenticated;

grant select, insert, update on table public.employee_documents to authenticated;
grant all on table public.employee_documents to service_role;

-- Own rows: read + insert (no delete). Admin with employees.view: read any.
drop policy if exists employee_documents_select_own_or_admin on public.employee_documents;
create policy employee_documents_select_own_or_admin
  on public.employee_documents
  for select
  to authenticated
  using (
    auth_private.employee_owned_by_current_auth(employee_id)
    or auth_private.current_user_has_permission('employees.view')
  );

drop policy if exists employee_documents_insert_own on public.employee_documents;
create policy employee_documents_insert_own
  on public.employee_documents
  for insert
  to authenticated
  with check (auth_private.employee_owned_by_current_auth(employee_id));

drop policy if exists employee_documents_update_own on public.employee_documents;
create policy employee_documents_update_own
  on public.employee_documents
  for update
  to authenticated
  using (auth_private.employee_owned_by_current_auth(employee_id))
  with check (auth_private.employee_owned_by_current_auth(employee_id));

-- ---------------------------------------------------------------------------
-- Private Storage bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-documents',
  'employee-documents',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path: {employee_id}/{document_type}/{filename}
drop policy if exists employee_documents_storage_select on storage.objects;
create policy employee_documents_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'employee-documents'
    and (
      auth_private.employee_owned_by_current_auth(((storage.foldername(name))[1])::bigint)
      or auth_private.current_user_has_permission('employees.view')
    )
  );

drop policy if exists employee_documents_storage_insert on storage.objects;
create policy employee_documents_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'employee-documents'
    and auth_private.employee_owned_by_current_auth(((storage.foldername(name))[1])::bigint)
  );

drop policy if exists employee_documents_storage_update on storage.objects;
create policy employee_documents_storage_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'employee-documents'
    and auth_private.employee_owned_by_current_auth(((storage.foldername(name))[1])::bigint)
  )
  with check (
    bucket_id = 'employee-documents'
    and auth_private.employee_owned_by_current_auth(((storage.foldername(name))[1])::bigint)
  );
