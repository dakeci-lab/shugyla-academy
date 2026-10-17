-- Stage 16b: journal of stock-norm changes (who, when, was -> became).
--
-- procurement_norm_rules only keeps the last editor. The journal is filled by a trigger on the table itself,
-- so every path that changes a norm (Edge Function, SQL, future code) is recorded. Writes that do not change
-- norm_days (re-saving the same value, re-applying subcategory overrides) are skipped.
-- No grants for anon/authenticated: the journal is read by the owner via SQL / service role.

select pg_advisory_xact_lock(202610171301);

create table public.procurement_norm_changes (
  id uuid primary key default gen_random_uuid(),
  changed_at timestamptz not null default now(),
  category_name text not null,
  subcategory_name text not null,
  old_norm_days integer,
  new_norm_days integer,
  changed_by text,
  changed_by_name text
);

create index procurement_norm_changes_changed_at_idx
  on public.procurement_norm_changes (changed_at desc);
create index procurement_norm_changes_scope_idx
  on public.procurement_norm_changes (category_name, subcategory_name, changed_at desc);

alter table public.procurement_norm_changes enable row level security;
revoke all on public.procurement_norm_changes from anon, authenticated;

create or replace function public.procurement_norm_rules_journal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.procurement_norm_changes
      (category_name, subcategory_name, old_norm_days, new_norm_days, changed_by, changed_by_name)
    values (new.category_name, new.subcategory_name, null, new.norm_days, new.updated_by, new.updated_by_name);
  elsif tg_op = 'UPDATE' then
    if new.norm_days is distinct from old.norm_days then
      insert into public.procurement_norm_changes
        (category_name, subcategory_name, old_norm_days, new_norm_days, changed_by, changed_by_name)
      values (new.category_name, new.subcategory_name, old.norm_days, new.norm_days, new.updated_by, new.updated_by_name);
    end if;
  else
    insert into public.procurement_norm_changes
      (category_name, subcategory_name, old_norm_days, new_norm_days, changed_by, changed_by_name)
    values (old.category_name, old.subcategory_name, old.norm_days, null, old.updated_by, old.updated_by_name);
  end if;
  return null;
end;
$$;

revoke all on function public.procurement_norm_rules_journal() from public, anon, authenticated;

create trigger procurement_norm_rules_journal
  after insert or update or delete on public.procurement_norm_rules
  for each row execute function public.procurement_norm_rules_journal();

-- Rollback:
--   drop trigger procurement_norm_rules_journal on public.procurement_norm_rules;
--   drop function public.procurement_norm_rules_journal();
--   drop table public.procurement_norm_changes;
