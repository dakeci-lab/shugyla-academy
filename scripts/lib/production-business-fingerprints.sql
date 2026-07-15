-- Canonical production business-table fingerprints (Step 22O/22P).
-- No PII in output — aggregate hashes only.

SELECT json_build_object(
  'academy_users',
    (SELECT md5(string_agg(row_hash, '' ORDER BY row_hash)) FROM (
      SELECT md5(concat_ws('|', id::text, coalesce(first_name,''), coalesce(last_name,''), coalesce(full_name,''), coalesce(login,''), coalesce(role,''), coalesce(role_id::text,''), coalesce(status,''), coalesce(position,''), coalesce(avatar_url,''), coalesce(created_at::text,''), coalesce(updated_at::text,''), coalesce(auth_user_id::text,''))) AS row_hash
      FROM public.academy_users
    ) s),
  'academy_employee_shifts',
    (SELECT md5(string_agg(row_hash, '' ORDER BY row_hash)) FROM (
      SELECT md5(concat_ws('|', id::text, coalesce(employee_id::text,''), coalesce(shift_date::text,''), coalesce(status,''), coalesce(created_at::text,''), coalesce(updated_at::text,''))) AS row_hash
      FROM public.academy_employee_shifts
    ) s),
  'roles',
    (SELECT md5(string_agg(row_hash, '' ORDER BY row_hash)) FROM (
      SELECT md5(concat_ws('|', id::text, coalesce(code,''), coalesce(name,''), coalesce(description,''), coalesce(created_at::text,''), coalesce(updated_at::text,''))) AS row_hash
      FROM public.roles
    ) s),
  'permissions',
    (SELECT md5(string_agg(row_hash, '' ORDER BY row_hash)) FROM (
      SELECT md5(concat_ws('|', id::text, coalesce(code,''), coalesce(name,''), coalesce(description,''), coalesce(created_at::text,''))) AS row_hash
      FROM public.permissions
    ) s),
  'role_permissions',
    (SELECT md5(string_agg(row_hash, '' ORDER BY row_hash)) FROM (
      SELECT md5(concat_ws('|', role_id::text, permission_id::text)) AS row_hash
      FROM public.role_permissions
    ) s),
  'shifts_row_count',
    (SELECT count(*)::int FROM public.academy_employee_shifts)
) AS fp;
