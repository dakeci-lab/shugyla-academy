-- Add purchase/receiving item tables to supabase_realtime publication.
-- Parent tables (purchase_orders, receiving_documents) were added earlier;
-- checklist qty/status edits often touch item rows without always changing parents.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'purchase_order_items'
  ) then
    alter publication supabase_realtime add table public.purchase_order_items;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'receiving_items'
  ) then
    alter publication supabase_realtime add table public.receiving_items;
  end if;
end $$;

-- Default replica identity is enough for debounced full-module refetch.
-- Do not force REPLICA IDENTITY FULL on item tables.
