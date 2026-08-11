-- ---------------------------------------------------------------------------
-- Atomic order state transitions: return to draft, cancel.
--
-- Before this migration both transitions were two client-side writes:
--   1. update receiving_documents
--   2. update purchase_orders
-- A failure between them left the order and its receiving document in
-- disagreement (order back in draft while the warehouse still waits, or an
-- order cancelled while the receiving document stays open). The "has the
-- warehouse started?" check was also read separately from the write, so
-- receiving could start in between.
--
-- Both transitions now happen inside one function, therefore one transaction:
--   * the order row is locked FOR UPDATE
--   * every non-cancelled receiving document of that order is locked FOR UPDATE
--   * the guard conditions are re-read under those locks
--   * only then are the rows written
--
-- Authorization is explicit inside the function: an authenticated employee with
-- procurement.edit. EXECUTE is granted to authenticated and service_role only.
--
-- Deliberately NOT done: no new privilege on procurement_snapshots. These
-- functions never touch the UMAG fact snapshot.
--
-- User-facing messages are Russian on purpose: they surface in the UI.
-- ---------------------------------------------------------------------------

select pg_advisory_xact_lock(202608120410);

-- ---------------------------------------------------------------------------
-- Shared guard: authenticated employee with procurement.edit
-- ---------------------------------------------------------------------------

create or replace function auth_private.require_procurement_edit()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Требуется вход в систему'
      using errcode = '42501';
  end if;

  if not auth_private.current_user_has_permission('procurement.edit') then
    raise exception 'Недостаточно прав для изменения заказа закупа'
      using errcode = '42501';
  end if;
end;
$$;

alter function auth_private.require_procurement_edit() owner to postgres;

revoke all on function auth_private.require_procurement_edit() from public;
revoke all on function auth_private.require_procurement_edit() from anon;
grant execute on function auth_private.require_procurement_edit() to authenticated;
grant execute on function auth_private.require_procurement_edit() to service_role;

-- ---------------------------------------------------------------------------
-- Return an order to draft so quantities can be corrected
-- ---------------------------------------------------------------------------

create or replace function public.procurement_return_order_to_draft(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.purchase_orders;
  v_receiving_started boolean;
  v_cancelled_documents integer := 0;
begin
  if p_order_id is null then
    raise exception 'Заказ не найден' using errcode = '22004';
  end if;

  perform auth_private.require_procurement_edit();

  select * into v_order
  from public.purchase_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Заказ не найден' using errcode = '22004';
  end if;

  -- Idempotent: already a draft, nothing to do.
  if v_order.status = 'draft' then
    return jsonb_build_object(
      'order_id', v_order.id,
      'status', v_order.status,
      'cancelled_receiving_documents', 0,
      'changed', false
    );
  end if;

  if v_order.status not in ('formed', 'sent', 'awaiting_receiving') then
    raise exception 'Этот заказ уже нельзя вернуть в черновик'
      using errcode = '55000';
  end if;

  -- Lock every live receiving document of this order, then re-read the guard
  -- under the lock: receiving may have started since the button was rendered.
  perform 1
  from public.receiving_documents as d
  where d.purchase_order_id = p_order_id
    and d.status <> 'cancelled'
  for update;

  select count(*) > 0
    into v_receiving_started
  from public.receiving_documents as d
  where d.purchase_order_id = p_order_id
    and d.status <> 'cancelled'
    and (
      d.status <> 'awaiting_receiving'
      or coalesce(d.total_received_qty, 0) > 0
    );

  if v_receiving_started then
    raise exception 'Склад начал приёмку — заказ изменить нельзя'
      using errcode = '55000';
  end if;

  update public.receiving_documents
     set status = 'cancelled',
         updated_at = now()
   where purchase_order_id = p_order_id
     and status <> 'cancelled';

  get diagnostics v_cancelled_documents = row_count;

  update public.purchase_orders
     set status = 'draft',
         transferred_to_receiving = false,
         receiving_document_id = null,
         updated_at = now()
   where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'draft',
    'cancelled_receiving_documents', v_cancelled_documents,
    'changed', true
  );
end;
$$;

alter function public.procurement_return_order_to_draft(uuid) owner to postgres;

comment on function public.procurement_return_order_to_draft(uuid) is
  'Returns a purchase order to draft and cancels its receiving documents in one transaction. Requires procurement.edit. Refuses once receiving has started.';

revoke all on function public.procurement_return_order_to_draft(uuid) from public;
revoke all on function public.procurement_return_order_to_draft(uuid) from anon;
grant execute on function public.procurement_return_order_to_draft(uuid) to authenticated;
grant execute on function public.procurement_return_order_to_draft(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Cancel an order together with its receiving documents
-- ---------------------------------------------------------------------------

create or replace function public.procurement_cancel_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.purchase_orders;
  v_receiving_started boolean;
  v_cancelled_documents integer := 0;
begin
  if p_order_id is null then
    raise exception 'Заказ не найден' using errcode = '22004';
  end if;

  perform auth_private.require_procurement_edit();

  select * into v_order
  from public.purchase_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Заказ не найден' using errcode = '22004';
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object(
      'order_id', v_order.id,
      'status', v_order.status,
      'cancelled_receiving_documents', 0,
      'changed', false
    );
  end if;

  if v_order.status = 'received' then
    raise exception 'Принятый заказ отменить нельзя'
      using errcode = '55000';
  end if;

  perform 1
  from public.receiving_documents as d
  where d.purchase_order_id = p_order_id
    and d.status <> 'cancelled'
  for update;

  select count(*) > 0
    into v_receiving_started
  from public.receiving_documents as d
  where d.purchase_order_id = p_order_id
    and d.status <> 'cancelled'
    and (
      d.status <> 'awaiting_receiving'
      or coalesce(d.total_received_qty, 0) > 0
    );

  -- Cancelling a delivery the warehouse already started accepting would leave
  -- received quantities attached to a cancelled order. That is an accounting
  -- decision, not a button.
  if v_receiving_started then
    raise exception 'Склад начал приёмку — заказ изменить нельзя'
      using errcode = '55000';
  end if;

  update public.receiving_documents
     set status = 'cancelled',
         updated_at = now()
   where purchase_order_id = p_order_id
     and status <> 'cancelled';

  get diagnostics v_cancelled_documents = row_count;

  update public.purchase_orders
     set status = 'cancelled',
         updated_at = now()
   where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'cancelled',
    'cancelled_receiving_documents', v_cancelled_documents,
    'changed', true
  );
end;
$$;

alter function public.procurement_cancel_order(uuid) owner to postgres;

comment on function public.procurement_cancel_order(uuid) is
  'Cancels a purchase order and its receiving documents in one transaction. Requires procurement.edit. Refuses once receiving has started or the order is received.';

revoke all on function public.procurement_cancel_order(uuid) from public;
revoke all on function public.procurement_cancel_order(uuid) from anon;
grant execute on function public.procurement_cancel_order(uuid) to authenticated;
grant execute on function public.procurement_cancel_order(uuid) to service_role;
