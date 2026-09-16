/**
 * Pure helpers for supplier payment obligations (календарь оплат).
 * Status is derived from platform_paid_at (native mark) + due_date + Asia/Aqtobe
 * today — NOT from UMAG's current_debt, which staff are instructed to zero out
 * in UMAG immediately at receiving time regardless of real payment status (see
 * docs/suppliers/native-payment-status-independence.md). current_debt stays
 * synced for reference only; owed amount is resolveOwedAmount().
 */

import { getPaymentAccountName } from '../services/paymentAccountsService'

export const OBLIGATION_STATUS = {
  PAID: 'paid',
  TERMS_MISSING: 'terms_missing',
  UPCOMING: 'upcoming',
  DUE_TODAY: 'due_today',
  OVERDUE: 'overdue',
}

export const OBLIGATION_STATUS_LABELS = {
  [OBLIGATION_STATUS.PAID]: 'Оплачено',
  [OBLIGATION_STATUS.TERMS_MISSING]: 'Требует настройки',
  [OBLIGATION_STATUS.UPCOMING]: 'До срока',
  [OBLIGATION_STATUS.DUE_TODAY]: 'Сегодня',
  [OBLIGATION_STATUS.OVERDUE]: 'Просрочено',
}

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

export function diffCalendarDays(fromKey, toKey) {
  const [fy, fm, fd] = String(fromKey).split('-').map(Number)
  const [ty, tm, td] = String(toKey).split('-').map(Number)
  const fromUtc = Date.UTC(fy, fm - 1, fd)
  const toUtc = Date.UTC(ty, tm - 1, td)
  return Math.round((toUtc - fromUtc) / 86_400_000)
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

export function deriveObligationStatus(obligation, todayKey = toAqtobeDateKey()) {
  if (obligation?.isSourceDeleted || obligation?.is_source_deleted) return OBLIGATION_STATUS.PAID
  if (isPlatformMarkedPaid(obligation)) return OBLIGATION_STATUS.PAID

  const due = obligation?.dueDate ?? obligation?.due_date ?? null
  if (!due) return OBLIGATION_STATUS.TERMS_MISSING
  if (due === todayKey) return OBLIGATION_STATUS.DUE_TODAY
  if (due < todayKey) return OBLIGATION_STATUS.OVERDUE
  return OBLIGATION_STATUS.UPCOMING
}

export function formatDaysUntilDue(dueDate, todayKey = toAqtobeDateKey()) {
  if (!dueDate) return 'Срок не настроен'
  const delta = diffCalendarDays(todayKey, dueDate)
  if (delta === 0) return 'Сегодня'
  if (delta === 1) return 'Осталось 1 день'
  if (delta > 1) return `Осталось ${delta} дней`
  if (delta === -1) return 'Просрочено на 1 день'
  return `Просрочено на ${Math.abs(delta)} дней`
}

/** Способ оплаты снапшота обязательства — имя счёта на момент последнего пересчёта. */
export function formatPaymentAccountSnapshot(obligation) {
  const accountId =
    obligation?.paymentAccountIdSnapshot ?? obligation?.payment_account_id_snapshot ?? null
  if (!accountId) return 'Не настроено'
  return getPaymentAccountName(accountId) || 'Не настроено'
}

/** Срок снапшота обязательства — независимо от способа оплаты. */
export function formatPaymentTermsDaysSnapshot(obligation) {
  const days = obligation?.defermentDaysSnapshot ?? obligation?.deferment_days_snapshot
  if (days == null) return 'Не настроено'
  return Number(days) === 0 ? 'Сразу' : `${days} дн.`
}

/** «Оплачено вручную 12.09 — Наличные» — null when not marked paid natively. */
export function formatPlatformPaymentMark(obligation) {
  if (!isPlatformMarkedPaid(obligation)) return null
  const paidAt = obligation?.platformPaidAt ?? obligation?.platform_paid_at
  const accountId =
    obligation?.platformPaymentAccountId ?? obligation?.platform_payment_account_id ?? null
  const dateLabel = formatDateKeyRu(toAqtobeDateKey(new Date(paidAt))) || ''
  const accountName = accountId ? getPaymentAccountName(accountId) : null
  return `Оплачено вручную${dateLabel ? ` ${dateLabel}` : ''}${accountName ? ` — ${accountName}` : ''}`
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

/**
 * Build dashboard summaries + date groups from active open obligations.
 */
export function buildPaymentScheduleView(obligations, todayKey = toAqtobeDateKey()) {
  const active = (obligations || []).filter(isActiveOpenObligation)
  const summaries = {
    dueToday: 0,
    next7Days: 0,
    overdue: 0,
    deferredNotYetDue: 0,
    termsMissing: 0,
    totalActiveDebt: 0,
    forecast3: 0,
    forecast7: 0,
    forecast14: 0,
    forecast30: 0,
  }

  const byDate = new Map()
  const termsMissingGroups = new Map()

  for (const ob of active) {
    const debt = resolveOwedAmount(ob)
    summaries.totalActiveDebt += debt
    const status = deriveObligationStatus(ob, todayKey)
    const due = ob.dueDate ?? ob.due_date ?? null
    const supplierKey = ob.platformSupplierId || ob.platform_supplier_id || 'unknown'
    const supplierName = ob.supplierName || ob.supplier_name || 'Без названия'

    if (status === OBLIGATION_STATUS.TERMS_MISSING) {
      summaries.termsMissing += debt
      let group = termsMissingGroups.get(supplierKey)
      if (!group) {
        group = {
          key: supplierKey,
          platformSupplierId: supplierKey === 'unknown' ? null : supplierKey,
          name: supplierName,
          amount: 0,
          count: 0,
          obligations: [],
          status: OBLIGATION_STATUS.TERMS_MISSING,
        }
        termsMissingGroups.set(supplierKey, group)
      }
      group.amount += debt
      group.count += 1
      group.obligations.push(ob)
      continue
    }

    if (status === OBLIGATION_STATUS.OVERDUE) summaries.overdue += debt
    if (status === OBLIGATION_STATUS.DUE_TODAY) summaries.dueToday += debt
    if (status === OBLIGATION_STATUS.UPCOMING) summaries.deferredNotYetDue += debt

    if (due) {
      const daysAhead = diffCalendarDays(todayKey, due)
      // "Ближайшие 7 дней" excludes today (shown separately) and overdue.
      if (daysAhead >= 1 && daysAhead <= 7) summaries.next7Days += debt
      if (daysAhead >= 0 && daysAhead <= 3) summaries.forecast3 += debt
      if (daysAhead >= 0 && daysAhead <= 7) summaries.forecast7 += debt
      if (daysAhead >= 0 && daysAhead <= 14) summaries.forecast14 += debt
      if (daysAhead >= 0 && daysAhead <= 30) summaries.forecast30 += debt

      let dateBucket = byDate.get(due)
      if (!dateBucket) {
        dateBucket = { dueDate: due, suppliers: new Map() }
        byDate.set(due, dateBucket)
      }
      let supplierGroup = dateBucket.suppliers.get(supplierKey)
      if (!supplierGroup) {
        supplierGroup = {
          key: `${due}:${supplierKey}`,
          platformSupplierId: supplierKey === 'unknown' ? null : supplierKey,
          name: supplierName,
          dueDate: due,
          amount: 0,
          count: 0,
          obligations: [],
          status,
        }
        dateBucket.suppliers.set(supplierKey, supplierGroup)
      }
      supplierGroup.amount += debt
      supplierGroup.count += 1
      supplierGroup.obligations.push(ob)
      // Prefer overdue/today over upcoming if mixed (shouldn't mix same due)
      if (status === OBLIGATION_STATUS.OVERDUE) supplierGroup.status = status
      else if (
        status === OBLIGATION_STATUS.DUE_TODAY &&
        supplierGroup.status !== OBLIGATION_STATUS.OVERDUE
      ) {
        supplierGroup.status = status
      }
    }
  }

  const overdueDates = []
  const todayDates = []
  const futureDates = []

  for (const bucket of byDate.values()) {
    const suppliers = [...bucket.suppliers.values()].sort((a, b) => b.amount - a.amount)
    const entry = {
      dueDate: bucket.dueDate,
      totalAmount: suppliers.reduce((s, g) => s + g.amount, 0),
      suppliers,
      kind:
        bucket.dueDate < todayKey
          ? 'overdue'
          : bucket.dueDate === todayKey
            ? 'today'
            : 'future',
    }
    if (entry.kind === 'overdue') overdueDates.push(entry)
    else if (entry.kind === 'today') todayDates.push(entry)
    else futureDates.push(entry)
  }

  overdueDates.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  futureDates.sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  const termsMissing = [...termsMissingGroups.values()].sort((a, b) => b.amount - a.amount)
  const overdueList = overdueDates.flatMap((entry) => entry.suppliers)
  const todayList = todayDates.flatMap((entry) => entry.suppliers)
  const upcomingList = futureDates.flatMap((entry) => entry.suppliers)

  const obligationCount = (groups) => groups.reduce((sum, g) => sum + (g.count || 0), 0)

  return {
    summaries,
    dateGroups: [...overdueDates, ...todayDates, ...futureDates],
    termsMissing,
    lists: {
      overdue: overdueList,
      today: todayList,
      upcoming: upcomingList,
      termsMissing,
    },
    tabCounts: {
      overdue: obligationCount(overdueList),
      today: obligationCount(todayList),
      upcoming: obligationCount(upcomingList),
      termsMissing: obligationCount(termsMissing),
    },
    activeCount: active.length,
  }
}

/** Default tab: overdue → today → upcoming → termsMissing. */
export function pickDefaultPaymentTab(tabCounts = {}) {
  if ((tabCounts.overdue || 0) > 0) return 'overdue'
  if ((tabCounts.today || 0) > 0) return 'today'
  if ((tabCounts.upcoming || 0) > 0) return 'upcoming'
  if ((tabCounts.termsMissing || 0) > 0) return 'termsMissing'
  return 'overdue'
}

function formatMonthCount(count) {
  const n = Number(count) || 0
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} месяц`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} месяца`
  return `${n} месяцев`
}

/**
 * Short outcome of an open-obligations sync. Details stay in the sync warning;
 * this only answers "did anything get refreshed, and is more work pending".
 */
export function describeObligationsSyncResult(result) {
  const processed = result?.months?.processed?.length || 0
  const remaining = result?.months?.remaining?.length || 0

  if (processed === 0) {
    return 'Ни один месяц не обновлён. Проверьте журнал синхронизации.'
  }
  if (remaining > 0) {
    return `Обновлено ${formatMonthCount(processed)}, осталось ${formatMonthCount(remaining)}. Нажмите синхронизацию повторно.`
  }
  return `Обновлено ${formatMonthCount(processed)}. Календарь оплат обновлён.`
}

/** dd.mm.yyyy from a plain YYYY-MM-DD key, without timezone conversion. */
function formatDateKeyRu(dateKey) {
  const [y, m, d] = String(dateKey || '').split('-')
  if (!y || !m || !d) return null
  return `${d}.${m}.${y}`
}

/**
 * Period the last sync actually covered. Shown next to "Обновлено" so a recent
 * timestamp cannot imply that months outside the window were checked.
 */
export function formatSyncCoverage(dateFrom, dateTo) {
  const from = formatDateKeyRu(dateFrom)
  const to = formatDateKeyRu(dateTo)
  if (!from || !to) return null
  return from === to ? from : `${from} — ${to}`
}

export function formatReceptionCount(count) {
  const n = Number(count) || 0
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} приёмка`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} приёмки`
  return `${n} приёмок`
}

export function buildSupplierPaymentSummary(obligations, todayKey = toAqtobeDateKey()) {
  const active = (obligations || []).filter(isActiveOpenObligation)
  const summary = {
    totalDebt: 0,
    dueToday: 0,
    next7Days: 0,
    overdue: 0,
    termsMissing: 0,
    nearestDueDate: null,
  }
  for (const ob of active) {
    const debt = resolveOwedAmount(ob)
    summary.totalDebt += debt
    const status = deriveObligationStatus(ob, todayKey)
    const due = ob.dueDate ?? ob.due_date ?? null
    if (status === OBLIGATION_STATUS.TERMS_MISSING) summary.termsMissing += debt
    if (status === OBLIGATION_STATUS.OVERDUE) summary.overdue += debt
    if (status === OBLIGATION_STATUS.DUE_TODAY) summary.dueToday += debt
    if (due) {
      const daysAhead = diffCalendarDays(todayKey, due)
      if (daysAhead >= 1 && daysAhead <= 7) summary.next7Days += debt
      if (
        status !== OBLIGATION_STATUS.TERMS_MISSING &&
        (summary.nearestDueDate == null || due < summary.nearestDueDate)
      ) {
        summary.nearestDueDate = due
      }
    }
  }
  return summary
}
