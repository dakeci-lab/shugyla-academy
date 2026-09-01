-- Employee documents: let staff with employees.edit manage ANY employee's
-- documents (upload/replace/delete), not just their own. Reported by the
-- owner: an admin viewing an employee's card could not upload a document
-- for them — insert/update RLS only ever allowed the employee themselves
-- (auth_private.employee_owned_by_current_auth), unlike the select policy
-- which already had an admin bypass via employees.view. Delete never
-- existed at all, for anyone — building it here alongside the fix, since
-- the owner explicitly asked for delete too.

select pg_advisory_xact_lock(202609011300);

-- ---------------------------------------------------------------------------
-- 1. public.employee_documents — add employees.edit bypass to insert/update,
--    add delete (self or employees.edit)
-- ---------------------------------------------------------------------------

drop policy if exists employee_documents_insert_own on public.employee_documents;
create policy employee_documents_insert_own_or_admin
  on public.employee_documents
  for insert
  to authenticated
  with check (
    auth_private.employee_owned_by_current_auth(employee_id)
    or auth_private.current_user_has_permission('employees.edit')
  );

drop policy if exists employee_documents_update_own on public.employee_documents;
create policy employee_documents_update_own_or_admin
  on public.employee_documents
  for update
  to authenticated
  using (
    auth_private.employee_owned_by_current_auth(employee_id)
    or auth_private.current_user_has_permission('employees.edit')
  )
  with check (
    auth_private.employee_owned_by_current_auth(employee_id)
    or auth_private.current_user_has_permission('employees.edit')
  );

grant delete on table public.employee_documents to authenticated;

drop policy if exists employee_documents_delete_own_or_admin on public.employee_documents;
create policy employee_documents_delete_own_or_admin
  on public.employee_documents
  for delete
  to authenticated
  using (
    auth_private.employee_owned_by_current_auth(employee_id)
    or auth_private.current_user_has_permission('employees.edit')
  );

-- ---------------------------------------------------------------------------
-- 2. storage.objects (employee-documents bucket) — same bypass for
--    insert/update, add delete
-- ---------------------------------------------------------------------------

drop policy if exists employee_documents_storage_insert on storage.objects;
create policy employee_documents_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'employee-documents'
    and (
      auth_private.employee_owned_by_current_auth(((storage.foldername(name))[1])::bigint)
      or auth_private.current_user_has_permission('employees.edit')
    )
  );

drop policy if exists employee_documents_storage_update on storage.objects;
create policy employee_documents_storage_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'employee-documents'
    and (
      auth_private.employee_owned_by_current_auth(((storage.foldername(name))[1])::bigint)
      or auth_private.current_user_has_permission('employees.edit')
    )
  )
  with check (
    bucket_id = 'employee-documents'
    and (
      auth_private.employee_owned_by_current_auth(((storage.foldername(name))[1])::bigint)
      or auth_private.current_user_has_permission('employees.edit')
    )
  );

drop policy if exists employee_documents_storage_delete on storage.objects;
create policy employee_documents_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'employee-documents'
    and (
      auth_private.employee_owned_by_current_auth(((storage.foldername(name))[1])::bigint)
      or auth_private.current_user_has_permission('employees.edit')
    )
  );
