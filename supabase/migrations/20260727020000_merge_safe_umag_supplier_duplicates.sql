-- Safe auto-merge of UMAG bootstrap duplicates into surviving local platform_suppliers.
-- Survivor = unlinked local row (keeps procurement + operational settings).
-- Duplicate = UMAG-created row (transfers umag_supplier_id + UMAG-owned fields, then soft-merged).

select pg_advisory_xact_lock(202607270200);

-- ---------------------------------------------------------------------------
-- 1. Soft-merge columns on canonical suppliers
-- ---------------------------------------------------------------------------

alter table public.platform_suppliers
  add column if not exists is_merged boolean not null default false,
  add column if not exists merged_into_supplier_id uuid null
    references public.platform_suppliers (id) on delete set null,
  add column if not exists merged_at timestamptz null;

create index if not exists idx_platform_suppliers_is_merged
  on public.platform_suppliers (is_merged)
  where is_merged = false;

create index if not exists idx_platform_suppliers_merged_into
  on public.platform_suppliers (merged_into_supplier_id)
  where merged_into_supplier_id is not null;

comment on column public.platform_suppliers.is_merged is
  'True when this row was a temporary UMAG-bootstrap duplicate and was merged into another canonical supplier.';
comment on column public.platform_suppliers.merged_into_supplier_id is
  'Surviving platform_suppliers.id after safe UMAG duplicate merge.';

-- Expand candidate statuses for manual review leftovers
alter table public.supplier_umag_match_candidates
  drop constraint if exists supplier_umag_match_candidates_status_check;

alter table public.supplier_umag_match_candidates
  add constraint supplier_umag_match_candidates_status_check check (
    status in ('open', 'accepted', 'dismissed', 'pending_manual_review')
  );

-- ---------------------------------------------------------------------------
-- 2. Classify + merge safe pairs; mark ambiguous for manual review
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  v_safe int := 0;
  v_ambiguous int := 0;
  v_supplies_remapped int := 0;
  v_recon_remapped int := 0;
  v_chunk_supplies int;
  v_chunk_recon int;
begin
  create temporary table tmp_safe_merges (
    candidate_id uuid primary key,
    umag_supplier_id bigint not null,
    survivor_id uuid not null,
    duplicate_id uuid not null,
    local_bin text,
    umag_bin text,
    dup_name text,
    dup_legal_name text,
    dup_umag_phone text,
    dup_actual_address text,
    dup_legal_address text,
    dup_is_umag_active boolean,
    dup_umag_last_synced_at timestamptz,
    class text not null
  ) on commit drop;

  insert into tmp_safe_merges (
    candidate_id,
    umag_supplier_id,
    survivor_id,
    duplicate_id,
    local_bin,
    umag_bin,
    dup_name,
    dup_legal_name,
    dup_umag_phone,
    dup_actual_address,
    dup_legal_address,
    dup_is_umag_active,
    dup_umag_last_synced_at,
    class
  )
  with c as (
    select *
    from public.supplier_umag_match_candidates
    where status = 'open'
      and match_reason = 'exact_name'
  ),
  pairs as (
    select
      c.id as candidate_id,
      c.umag_supplier_id,
      c.platform_supplier_id as survivor_id,
      local_p.name as local_name,
      local_p.bin as local_bin,
      local_p.umag_supplier_id as local_umag_id,
      umag_p.id as duplicate_id,
      umag_p.bin as umag_bin,
      umag_p.name as dup_name,
      umag_p.legal_name as dup_legal_name,
      umag_p.umag_phone as dup_umag_phone,
      umag_p.actual_address as dup_actual_address,
      umag_p.legal_address as dup_legal_address,
      umag_p.is_umag_active as dup_is_umag_active,
      umag_p.umag_last_synced_at as dup_umag_last_synced_at,
      umag_p.name as umag_created_name
    from c
    join public.platform_suppliers local_p on local_p.id = c.platform_supplier_id
    join public.platform_suppliers umag_p
      on umag_p.umag_supplier_id = c.umag_supplier_id
     and coalesce(umag_p.is_merged, false) = false
  ),
  name_local_counts as (
    select lower(trim(name)) as nkey, count(*) as cnt
    from public.platform_suppliers
    where umag_supplier_id is null
      and coalesce(is_merged, false) = false
    group by 1
  ),
  name_umag_counts as (
    select lower(trim(name)) as nkey, count(*) as cnt
    from public.platform_suppliers
    where umag_supplier_id is not null
      and coalesce(is_merged, false) = false
    group by 1
  ),
  umag_id_local_candidates as (
    select umag_supplier_id, count(*) as cnt
    from c
    group by 1
  ),
  local_id_umag_candidates as (
    select platform_supplier_id, count(*) as cnt
    from c
    group by 1
  ),
  classified as (
    select
      p.*,
      case
        when p.local_umag_id is not null then 'ambiguous_local_already_linked'
        when p.duplicate_id is null then 'ambiguous_missing_umag_created'
        when p.survivor_id = p.duplicate_id then 'ambiguous_same_row'
        when exists (
          select 1 from public.purchase_orders po where po.supplier_id = p.duplicate_id
        ) or exists (
          select 1 from public.receiving_documents rd where rd.supplier_id = p.duplicate_id
        ) then 'ambiguous_umag_created_used_in_procurement'
        when nlc.cnt <> 1 then 'ambiguous_multiple_local_same_name'
        when nuc.cnt <> 1 then 'ambiguous_multiple_umag_created_same_name'
        when uic.cnt <> 1 then 'ambiguous_multiple_local_for_umag'
        when lic.cnt <> 1 then 'ambiguous_multiple_umag_for_local'
        when nullif(trim(p.local_bin), '') is not null
          and nullif(trim(p.umag_bin), '') is not null
          and trim(p.local_bin) <> trim(p.umag_bin)
          then 'ambiguous_bin_conflict'
        when lower(trim(p.local_name)) <> lower(trim(p.umag_created_name))
          then 'ambiguous_name_mismatch'
        else 'safe'
      end as class
    from pairs p
    left join name_local_counts nlc on nlc.nkey = lower(trim(p.local_name))
    left join name_umag_counts nuc on nuc.nkey = lower(trim(p.umag_created_name))
    left join umag_id_local_candidates uic on uic.umag_supplier_id = p.umag_supplier_id
    left join local_id_umag_candidates lic on lic.platform_supplier_id = p.survivor_id
  )
  select
    candidate_id,
    umag_supplier_id,
    survivor_id,
    duplicate_id,
    local_bin,
    umag_bin,
    dup_name,
    dup_legal_name,
    dup_umag_phone,
    dup_actual_address,
    dup_legal_address,
    dup_is_umag_active,
    dup_umag_last_synced_at,
    class
  from classified;

  -- Mark ambiguous candidates for manual review (no data changes)
  update public.supplier_umag_match_candidates c
  set status = 'pending_manual_review'
  from tmp_safe_merges t
  where c.id = t.candidate_id
    and t.class <> 'safe';

  get diagnostics v_ambiguous = row_count;

  -- Merge each safe pair atomically-enough within this transaction
  for r in
    select * from tmp_safe_merges where class = 'safe' order by survivor_id
  loop
    -- Guard: unique umag_supplier_id must still sit on duplicate
    if not exists (
      select 1
      from public.platform_suppliers d
      where d.id = r.duplicate_id
        and d.umag_supplier_id = r.umag_supplier_id
        and coalesce(d.is_merged, false) = false
    ) then
      update public.supplier_umag_match_candidates
      set status = 'pending_manual_review'
      where id = r.candidate_id;
      v_ambiguous := v_ambiguous + 1;
      continue;
    end if;

    if exists (
      select 1 from public.platform_suppliers s
      where s.id = r.survivor_id
        and s.umag_supplier_id is not null
    ) then
      update public.supplier_umag_match_candidates
      set status = 'pending_manual_review'
      where id = r.candidate_id;
      v_ambiguous := v_ambiguous + 1;
      continue;
    end if;

    -- 1) Free unique umag_supplier_id on duplicate
    update public.platform_suppliers
    set umag_supplier_id = null
    where id = r.duplicate_id;

    -- 2) Attach UMAG identity + UMAG-owned fields to survivor (never touch operational fields)
    update public.platform_suppliers
    set
      umag_supplier_id = r.umag_supplier_id,
      name = coalesce(nullif(trim(r.dup_name), ''), name),
      legal_name = coalesce(r.dup_legal_name, legal_name),
      bin = coalesce(nullif(trim(r.umag_bin), ''), nullif(trim(r.local_bin), ''), bin),
      umag_phone = coalesce(r.dup_umag_phone, umag_phone),
      actual_address = coalesce(r.dup_actual_address, actual_address),
      legal_address = coalesce(r.dup_legal_address, legal_address),
      is_umag_active = coalesce(r.dup_is_umag_active, is_umag_active),
      umag_last_synced_at = coalesce(r.dup_umag_last_synced_at, umag_last_synced_at)
    where id = r.survivor_id;

    -- 3) Remap integration FKs from duplicate → survivor
    update public.umag_supplies
    set platform_supplier_id = r.survivor_id
    where platform_supplier_id = r.duplicate_id;
    get diagnostics v_chunk_supplies = row_count;
    v_supplies_remapped := v_supplies_remapped + v_chunk_supplies;

    update public.supplier_reconciliations
    set supplier_id = r.survivor_id
    where supplier_id = r.duplicate_id;
    get diagnostics v_chunk_recon = row_count;
    v_recon_remapped := v_recon_remapped + v_chunk_recon;

    -- 4) Soft-merge duplicate out of UI
    update public.platform_suppliers
    set
      is_merged = true,
      merged_into_supplier_id = r.survivor_id,
      merged_at = now(),
      status = 'archived'
    where id = r.duplicate_id;

    -- 5) Resolve candidate
    update public.supplier_umag_match_candidates
    set status = 'accepted'
    where id = r.candidate_id;

    v_safe := v_safe + 1;
  end loop;

  raise notice
    'safe_umag_duplicate_merge auto_merged=% ambiguous_manual=% supplies_remapped=% reconciliations_remapped=%',
    v_safe, v_ambiguous, v_supplies_remapped, v_recon_remapped;
end $$;
