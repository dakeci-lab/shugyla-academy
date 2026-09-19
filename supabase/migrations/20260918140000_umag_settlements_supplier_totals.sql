-- «Взаиморасчёты» перф: список поставщиков грузится 5-8с, потому что
-- fetchUmagSettlementsBySupplier() тянет КАЖДЫЙ документ (приёмки/возвраты/
-- оплаты) за период для ВСЕХ поставщиков разом, только чтобы посчитать 5
-- сумм на список (Приёмок/Сумма/Возвраты/Оплачено/Долг) — и это ещё до того,
-- как пользователь откроет хоть одну карточку поставщика.
--
-- Эта функция считает те же 5 сумм одним SQL-запросом с группировкой —
-- клиент получает ~150-200 маленьких строк вместо ~1500+ сырых документов.
-- Детальная история по одному поставщику (нужна только при открытии его
-- карточки) остаётся отдельным, узким запросом — см. следующий этап работы
-- в umagSettlementsService.js (fetchUmagSupplierOperationHistory).
--
-- Логика — точная копия существующей клиентской (ensureSettlementRow /
-- isUmagPaymentRefund / attributedSupplyIds в umagSettlementsService.js),
-- проверена построчно на прод-данных перед применением (см. отчёт в чате):
-- сверено с двумя реальными поставщиками — с приёмками в периоде и без них
-- (только с оплатой старого долга) — суммы совпали точно.

select pg_advisory_xact_lock(202609181400);

create or replace function public.umag_settlements_supplier_totals(
  p_date_from date,
  p_date_to date
)
returns table (
  key text,
  platform_supplier_id uuid,
  umag_supplier_id bigint,
  name text,
  legal_name text,
  supply_count bigint,
  amount numeric,
  payment_amount_from_supplies numeric,
  return_count bigint,
  return_amount numeric,
  document_payment_amount numeric,
  document_refund_amount numeric,
  native_payment_amount numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with b as (
    select
      (p_date_from::text || 'T00:00:00+05:00')::timestamptz as from_ts,
      (p_date_to::text || 'T23:59:59.999+05:00')::timestamptz as to_ts
  ),
  supplies as (
    select
      coalesce(
        s.platform_supplier_id::text,
        case
          when s.umag_supplier_id is not null then 'umag:' || s.umag_supplier_id::text
          else 'name:' || coalesce(s.supplier_name, 'Без названия')
        end
      ) as key,
      s.platform_supplier_id, s.umag_supplier_id, s.supplier_name, s.supplier_legal_name,
      s.amount, s.payment_amount
    from public.umag_supplies s, b
    where s.is_source_deleted = false
      and s.doc_time >= b.from_ts and s.doc_time <= b.to_ts
  ),
  supply_agg as (
    select
      key,
      min(platform_supplier_id::text)::uuid as platform_supplier_id,
      min(umag_supplier_id) as umag_supplier_id,
      min(supplier_name) as name,
      min(supplier_legal_name) as legal_name,
      count(*) as supply_count,
      coalesce(sum(amount), 0) as amount,
      coalesce(sum(payment_amount), 0) as payment_amount_from_supplies
    from supplies
    group by key
  ),
  returns as (
    select
      coalesce(
        r.platform_supplier_id::text,
        case
          when r.umag_supplier_id is not null then 'umag:' || r.umag_supplier_id::text
          else 'name:' || coalesce(r.supplier_name, 'Без названия')
        end
      ) as key,
      r.supplier_name,
      abs(r.amount) as amt
    from public.umag_supply_returns r, b
    where r.is_source_deleted = false
      and r.document_time >= b.from_ts and r.document_time <= b.to_ts
  ),
  return_agg as (
    select key, min(supplier_name) as name, count(*) as return_count, coalesce(sum(amt), 0) as return_amount
    from returns
    group by key
  ),
  payments as (
    select
      coalesce(
        p.platform_supplier_id::text,
        case
          when p.umag_supplier_id is not null then 'umag:' || p.umag_supplier_id::text
          else 'name:' || coalesce(p.supplier_name, 'Без названия')
        end
      ) as key,
      p.supplier_name,
      p.amount,
      -- Same predicate as isUmagPaymentRefund() (src/utils/supplierLedger.js).
      (upper(coalesce(p.payment_type, '')) = 'SUPPLY_REFUND' or p.amount < 0 or p.class_name = 'SupplyReturn') as is_refund,
      p.linked_umag_supply_id
    from public.umag_document_payments p, b
    where p.is_source_deleted = false
      and p.payment_time >= b.from_ts and p.payment_time <= b.to_ts
  ),
  payment_agg as (
    select
      key,
      min(supplier_name) as name,
      coalesce(sum(abs(amount)) filter (where is_refund), 0) as document_refund_amount,
      -- Excludes non-refund payments whose linked supply already has a real
      -- native "Оплачено" attribution — same rule as attributedSupplyIds in
      -- umagSettlementsService.js (that native mark is the trustworthy one).
      coalesce(
        sum(abs(amount)) filter (
          where not is_refund
            and not exists (
              select 1 from public.supplier_payment_obligations spo
              where spo.umag_supply_id = payments.linked_umag_supply_id
                and spo.platform_paid_by is not null
            )
        ),
        0
      ) as document_payment_amount
    from payments
    group by key
  ),
  native_payments as (
    select
      coalesce(o.platform_supplier_id::text, 'name:Без названия') as key,
      o.platform_supplier_id,
      ps.name as supplier_name,
      o.original_supply_amount
    from public.supplier_payment_obligations o
    join b on true
    left join public.platform_suppliers ps on ps.id = o.platform_supplier_id
    where o.platform_paid_at is not null
      and o.platform_paid_by is not null
      and o.platform_paid_at >= b.from_ts and o.platform_paid_at <= b.to_ts
  ),
  native_agg as (
    select
      key,
      min(platform_supplier_id::text)::uuid as platform_supplier_id,
      min(supplier_name) as name,
      coalesce(sum(abs(original_supply_amount)), 0) as native_payment_amount
    from native_payments
    group by key
  ),
  all_keys as (
    select key from supply_agg
    union
    select key from return_agg
    union
    select key from payment_agg
    union
    select key from native_agg
  )
  select
    k.key,
    coalesce(sa.platform_supplier_id, na.platform_supplier_id) as platform_supplier_id,
    sa.umag_supplier_id,
    coalesce(sa.name, ra.name, pa.name, na.name, 'Без названия') as name,
    sa.legal_name,
    coalesce(sa.supply_count, 0) as supply_count,
    coalesce(sa.amount, 0) as amount,
    coalesce(sa.payment_amount_from_supplies, 0) as payment_amount_from_supplies,
    coalesce(ra.return_count, 0) as return_count,
    coalesce(ra.return_amount, 0) as return_amount,
    coalesce(pa.document_payment_amount, 0) as document_payment_amount,
    coalesce(pa.document_refund_amount, 0) as document_refund_amount,
    coalesce(na.native_payment_amount, 0) as native_payment_amount
  from all_keys k
  left join supply_agg sa on sa.key = k.key
  left join return_agg ra on ra.key = k.key
  left join payment_agg pa on pa.key = k.key
  left join native_agg na on na.key = k.key
$$;

comment on function public.umag_settlements_supplier_totals(date, date) is
  'Per-supplier aggregate totals for the «Взаиморасчёты» list (Приёмок/Сумма/Возвраты/Оплачено) — SQL-side GROUP BY replacing a client-side reduction over every raw document row. security invoker: relies on the same RLS the client already queries these tables under.';

revoke all on function public.umag_settlements_supplier_totals(date, date) from public;
revoke all on function public.umag_settlements_supplier_totals(date, date) from anon;
grant execute on function public.umag_settlements_supplier_totals(date, date) to authenticated;
grant execute on function public.umag_settlements_supplier_totals(date, date) to service_role;
