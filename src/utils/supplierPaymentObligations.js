/**
 * Pure helpers for supplier payment obligations (native paid marks, payment-terms
 * snapshots). Paid/unpaid is derived from platform_paid_at (native mark) — NOT from
 * UMAG's current_debt, which staff are instructed to zero out in UMAG immediately at
 * receiving time regardless of real payment status (see
 * docs/suppliers/native-payment-status-independence.md). current_debt stays synced
 * for reference only; owed amount is resolveOwedAmount().
 */

/** Local calendar YYYY-MM-DD in Asia/Aqtobe. */
export function toAqtobeDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Aqtobe',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${d}`
}

export function addCalendarDays(dateKey, days) {
  const [y, m, d] = String(dateKey).split('-').map(Number)
  const utc = Date.UTC(y, m - 1, d) + Number(days) * 86_400_000
  const dt = new Date(utc)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * Resolve whether supplier terms can produce a due_date snapshot.
 * accountId (способ оплаты) and days (срок) are independent axes: an account
 * can be set with no configured days (due_date stays null → «Требует
 * настройки»), and days can be configured with no account chosen yet.
 */
export function resolveSupplierPaymentTerms(supplier) {
  const accountId = supplier?.paymentAccountId ?? supplier?.payment_account_id ?? null
  const raw = supplier?.deferralDays ?? supplier?.deferral_days
  const days = raw == null || raw === '' ? null : Number(raw)
  if (Number.isInteger(days) && days >= 0 && days <= 365) {
    return { accountId, days, configured: true }
  }
  return { accountId, days: null, configured: false }
}

export function computeDueDateFromTerms(docDateKey, terms) {
  if (!docDateKey || !terms?.configured) return null
  return addCalendarDays(docDateKey, terms.days ?? 0)
}

/**
 * What an obligation's terms snapshot should be, given the supplier's
 * CURRENT terms — used to keep still-open obligations in sync when a
 * supplier's payment terms change after the obligation was first seen
 * (previously the snapshot was write-once and silently went stale; see
 * docs/suppliers/retroactive-payment-terms.md).
 *
 * Returns null when the current snapshot already matches (nothing to write).
 */
export function resolveObligationTermsPatch(currentSnapshot, terms, docDateKey) {
  // Account (способ) snapshots whatever the supplier currently has regardless
  // of whether days are configured — it's an independent axis from due_date.
  const nextAccountId = terms?.accountId ?? null
  const nextDays = terms?.configured ? terms.days : null
  const nextDueDate = computeDueDateFromTerms(docDateKey, terms)

  const currentAccountId = currentSnapshot?.paymentAccountIdSnapshot ?? null
  const currentDays =
    currentSnapshot?.defermentDaysSnapshot == null
      ? null
      : Number(currentSnapshot.defermentDaysSnapshot)
  const currentDueDate = currentSnapshot?.dueDate ?? null

  if (
    currentAccountId === nextAccountId &&
    currentDays === nextDays &&
    currentDueDate === nextDueDate
  ) {
    return null
  }

  return {
    payment_account_id_snapshot: nextAccountId,
    deferment_days_snapshot: nextDays,
    due_date: nextDueDate,
  }
}

/**
 * True once marked paid natively in Shugyla — independent of UMAG's own
 * current_debt mirror. Set by a single instant click (see
 * markObligationPaid/unmarkObligationPaid); a later UMAG sync can never
 * clear it, only an explicit "Отменить оплату" can.
 */
export function isPlatformMarkedPaid(obligation) {
  return Boolean(obligation?.platformPaidAt ?? obligation?.platform_paid_at)
}

/**
 * The amount actually owed per OUR OWN tracking — ignores UMAG's current_debt
 * entirely (the owner instructed staff to mark every UMAG document paid at
 * receiving time regardless of real payment status, so current_debt is no
 * longer a meaningful signal: it reads 0 even for genuinely unpaid consignment
 * deliveries). Full invoice amount until natively marked paid, then 0 — v1 is
 * full-payment-only, no partial tracking.
 */
export function resolveOwedAmount(obligation) {
  if (isPlatformMarkedPaid(obligation)) return 0
  const amount = Number(obligation?.originalSupplyAmount ?? obligation?.original_supply_amount ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

export function isActiveOpenObligation(obligation) {
  if (!obligation) return false
  if (obligation.isSourceDeleted || obligation.is_source_deleted) return false
  return !isPlatformMarkedPaid(obligation)
}

/**
 * Shape natively-marked obligations as umag_document_payments-like rows so
 * they can drop straight into buildSupplierOperationHistory()/isUmagPaymentRefund()
 * in umagSettlementsService.js — replacing UMAG's own document-payment feed
 * as the source for «Оплата поставщику» entries in «Взаиморасчёты». UMAG's
 * payment dates became untrustworthy once staff started marking documents
 * paid in UMAG immediately at receiving time (to skip the manual UMAG
 * payment flow entirely); the real payment moment is now the "Оплачено"
 * click tracked here, not a UMAG timestamp.
 */
export function buildNativeSettlementPaymentRows(
  obligations,
  { accountNameById, employeeNameById } = {}
) {
  const rows = []
  for (const ob of obligations || []) {
    const paidAt = ob?.platformPaidAt ?? ob?.platform_paid_at
    if (!paidAt) continue
    const amount = Math.abs(Number(ob?.originalSupplyAmount ?? ob?.original_supply_amount ?? 0)) || 0
    const accountId = ob?.platformPaymentAccountId ?? ob?.platform_payment_account_id ?? null
    const employeeId = ob?.platformPaidBy ?? ob?.platform_paid_by ?? null
    rows.push({
      id: `platform-paid:${ob.id}`,
      obligation_id: ob.id,
      umag_payment_id: null,
      platform_supplier_id: ob.platformSupplierId ?? ob.platform_supplier_id ?? null,
      umag_supplier_id: null,
      supplier_name: ob.supplierName ?? ob.supplier_name ?? null,
      payment_time: paidAt,
      amount,
      payment_type: 'PLATFORM_MARK',
      class_name: null,
      linked_umag_supply_id: ob.umagSupplyId ?? ob.umag_supply_id ?? null,
      linked_umag_return_id: null,
      account_name: (accountNameById && accountNameById.get(accountId)) || null,
      user_name: (employeeNameById && employeeNameById.get(employeeId)) || null,
      note: null,
      external_source: 'platform',
    })
  }
  return rows
}
