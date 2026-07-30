/**
 * Supplier reconciliation ledger helpers (calendar date keys + balance math).
 * Amounts are decimal numbers matching UMAG numeric(20,4) mirrors — no float inventing.
 */

export const LEDGER_EVENT_TYPES = {
  OPENING_BALANCE: 'opening_balance',
  RECEIVING: 'receiving',
  SUPPLIER_PAYMENT: 'supplier_payment',
  SUPPLIER_RETURN: 'supplier_return',
  SUPPLIER_REFUND: 'supplier_refund',
  ADJUSTMENT: 'adjustment',
}

export const LEDGER_EVENT_LABELS = {
  [LEDGER_EVENT_TYPES.OPENING_BALANCE]: 'Начальное сальдо',
  [LEDGER_EVENT_TYPES.RECEIVING]: 'Приёмка',
  [LEDGER_EVENT_TYPES.SUPPLIER_PAYMENT]: 'Оплата поставщику',
  [LEDGER_EVENT_TYPES.SUPPLIER_RETURN]: 'Возврат поставщику',
  [LEDGER_EVENT_TYPES.SUPPLIER_REFUND]: 'Возврат денежных средств',
  [LEDGER_EVENT_TYPES.ADJUSTMENT]: 'Корректировка',
}

export function ledgerEventLabel(eventType) {
  return LEDGER_EVENT_LABELS[eventType] || eventType || 'Операция'
}

export function ledgerEventStatusLabel(eventType, status) {
  if (status === 'cancelled') return 'Отменено'
  if (status === 'draft') return 'Черновик'
  switch (eventType) {
    case LEDGER_EVENT_TYPES.SUPPLIER_PAYMENT:
      return 'Проведено'
    case LEDGER_EVENT_TYPES.SUPPLIER_REFUND:
      return 'Зачтено'
    case LEDGER_EVENT_TYPES.SUPPLIER_RETURN:
      return 'Возвращено'
    case LEDGER_EVENT_TYPES.RECEIVING:
      return 'Проведено'
    case LEDGER_EVENT_TYPES.OPENING_BALANCE:
      return 'Сальдо'
    default:
      return 'Проведено'
  }
}

/**
 * balanceDelta map (accounts payable to supplier):
 * - receiving: +amount
 * - supplier_payment: -amount
 * - supplier_return: -amount (goods return reduces AP once)
 * - supplier_refund: 0 (cash confirmation of return — do not double-count)
 */
export function balanceDeltaForLedgerEvent(eventType, amount, explicitDelta) {
  if (explicitDelta != null && Number.isFinite(Number(explicitDelta))) {
    return Number(explicitDelta)
  }
  const abs = Math.abs(Number(amount) || 0)
  switch (eventType) {
    case LEDGER_EVENT_TYPES.RECEIVING:
      return abs
    case LEDGER_EVENT_TYPES.SUPPLIER_PAYMENT:
      return -abs
    case LEDGER_EVENT_TYPES.SUPPLIER_RETURN:
      return -abs
    case LEDGER_EVENT_TYPES.SUPPLIER_REFUND:
      return 0
    case LEDGER_EVENT_TYPES.OPENING_BALANCE:
      return Number(amount) || 0
    default:
      return Number(amount) || 0
  }
}

export function debtIncrease(balanceDelta) {
  const d = Number(balanceDelta) || 0
  return d > 0 ? d : 0
}

export function debtDecrease(balanceDelta) {
  const d = Number(balanceDelta) || 0
  return d < 0 ? Math.abs(d) : 0
}

/**
 * Chronological ascending for balance, then attach running balance.
 * Display may reverse to newest-first afterward.
 */
export function attachRunningBalances(events, openingBalance = 0) {
  const sorted = [...events].sort((a, b) => {
    const ta = new Date(a.occurredAt || a.sortAt || 0).getTime()
    const tb = new Date(b.occurredAt || b.sortAt || 0).getTime()
    if (ta !== tb) return ta - tb
    return String(a.id || a.externalId || '').localeCompare(String(b.id || b.externalId || ''))
  })

  let running = Number(openingBalance) || 0
  const withBalance = sorted.map((event) => {
    const delta = balanceDeltaForLedgerEvent(
      event.eventType || event.kind,
      event.amount,
      event.balanceDelta
    )
    running += delta
    return {
      ...event,
      balanceDelta: delta,
      debtIncrease: debtIncrease(delta),
      debtDecrease: debtDecrease(delta),
      runningBalance: running,
    }
  })

  return { eventsAsc: withBalance, closingBalance: running }
}

export function sortLedgerNewestFirst(events) {
  return [...events].sort((a, b) => {
    const ta = new Date(a.occurredAt || a.sortAt || 0).getTime()
    const tb = new Date(b.occurredAt || b.sortAt || 0).getTime()
    if (tb !== ta) return tb - ta
    return String(b.id || '').localeCompare(String(a.id || ''))
  })
}
