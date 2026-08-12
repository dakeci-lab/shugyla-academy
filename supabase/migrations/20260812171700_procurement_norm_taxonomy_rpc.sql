-- Compact taxonomy API for the Norms screen. The browser receives distinct
-- category pairs instead of downloading every snapshot SKU.

create index if not exists idx_psi_snapshot_category_subcategory
  on public.procurement_snapshot_items (snapshot_id, category_name, subcategory_name);

create or replace function public.get_procurement_norm_taxonomy(p_snapshot_id uuid)
returns table (
  category_name text,
  subcategory_name text
)
language sql
stable
security invoker
returns null on null input
set search_path = ''
as $$
  select
    item.category_name,
    item.subcategory_name
  from public.procurement_snapshot_items as item
  where item.snapshot_id = p_snapshot_id
  group by item.category_name, item.subcategory_name
  order by item.category_name, item.subcategory_name;
$$;

revoke all on function public.get_procurement_norm_taxonomy(uuid) from public;
revoke all on function public.get_procurement_norm_taxonomy(uuid) from anon;
grant execute on function public.get_procurement_norm_taxonomy(uuid) to authenticated;
