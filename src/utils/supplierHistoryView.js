/**
 * Pure presentation helpers for the supplier card (history of operations) and the supplier list
 * under «Расчёты» — kept out of the JSX so they are directly testable.
 */

/** «3 неоплаченных · с 15.10» — second line of a supplier row; '' when nothing is open. */
export function describeOpenDocuments({ count = 0, oldestDate = null } = {}) {
  if (!count) return ''
  const noun =
    count % 10 === 1 && count % 100 !== 11
      ? 'неоплаченный'
      : 'неоплаченных'
  const since = oldestDate ? ` · с ${formatShortDate(oldestDate)}` : ''
  return `${count} ${noun}${since}`
}

/** '2026-10-15' → '15.10'. */
export function formatShortDate(dateKey) {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(String(dateKey || ''))
  return match ? `${match[2]}.${match[1]}` : ''
}

/**
 * Amount as shown in the history: supplies are plain (they are what we owe), payments and returns carry a
 * minus (they reduce it). Colour is reserved for things that need action, not for the sign.
 */
export function operationAmountSign(op) {
  if (op?.kind === 'payment' || op?.kind === 'return') return '−'
  if (op?.kind === 'refund') return ''
  return ''
}

/** Operations that still need a click: unpaid supplies and returns whose money has not come back. */
export function isOpenOperation(op) {
  return Boolean(op?.settlement && !op.settlement.settled)
}

export function countOpenOperations(operations) {
  return (operations || []).filter(isOpenOperation).length
}

/**
 * Search box of the history: matches the document number, the amount (with or without spaces, comma or dot)
 * or the operation label. An empty query matches everything.
 */
export function matchesOperationQuery(op, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  if (String(op?.documentNumber || '').toLowerCase().includes(q)) return true
  if (String(op?.label || '').toLowerCase().includes(q)) return true
  const digits = q.replace(/[^\d]/g, '')
  if (digits.length >= 2) {
    const amount = Math.abs(Number(op?.amount) || 0)
    const integerPart = String(Math.round(amount))
    const exact = String(amount).replace('.', '')
    if (integerPart.includes(digits) || exact.includes(digits)) return true
  }
  return false
}

/** Whole days from fromKey to toKey (both 'YYYY-MM-DD'); positive when toKey is later. */
function daysBetween(fromKey, toKey) {
  const parse = (key) => {
    const [y, m, d] = String(key).split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((parse(toKey) - parse(fromKey)) / 86_400_000)
}

/**
 * Payment deadline of an open document, for the history row: «просрочено на 3 дн.» (tone 'overdue'),
 * «срок сегодня» ('today'), «срок до 25.10» ('upcoming'); nothing when the supplier has no payment term
 * (due date unknown) or the document is already closed.
 */
export function describeDue(dueDate, todayKey) {
  if (!dueDate || !todayKey) return null
  const late = daysBetween(dueDate, todayKey)
  if (late > 0) return { tone: 'overdue', text: `просрочено на ${late} дн.` }
  if (late === 0) return { tone: 'today', text: 'срок сегодня' }
  return { tone: 'upcoming', text: `срок до ${formatShortDate(dueDate)}` }
}

/** An open supply whose due date is before today. */
export function isOverdueOperation(op, todayKey) {
  const settlement = op?.settlement
  if (!settlement || settlement.settled || settlement.type !== 'payable') return false
  return Boolean(settlement.dueDate && todayKey && settlement.dueDate < todayKey)
}

export function countOverdueOperations(operations, todayKey) {
  return (operations || []).filter((op) => isOverdueOperation(op, todayKey)).length
}
