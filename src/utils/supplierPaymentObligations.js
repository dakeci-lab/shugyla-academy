/**
 * Pure helpers for supplier payment obligations (календарь оплат).
 * Status is derived from current_debt + due_date + Asia/Aqtobe today — not stored.
 */

import { PAYMENT_TYPE, PAYMENT_TYPE_LABELS } from './supplierData'

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

export function isImmediatePaymentType(paymentType) {
  return paymentType === PAYMENT_TYPE.CASH || paymentType === PAYMENT_TYPE.TRANSFER
}

export function isDeferralPaymentType(paymentType) {
  return paymentType === PAYMENT_TYPE.DEFERRAL || paymentType === PAYMENT_TYPE.MIXED
}

/**
 * Resolve whether supplier terms can produce a due_date snapshot.
 * Uses existing platform_suppliers.payment_type + deferral_days.
 */
export function resolveSupplierPaymentTerms(supplier) {
  const type = supplier?.paymentType || supplier?.payment_type || null
  if (isImmediatePaymentType(type)) {
    return { type, days: 0, configured: true, kind: 'immediate' }
  }
  if (isDeferralPaymentType(type)) {
    const raw = supplier?.deferralDays ?? supplier?.deferral_days
    const days = raw == null || raw === '' ? null : Number(raw)
    if (Number.isInteger(days) && days >= 0 && days <= 365) {
      return { type, days, configured: true, kind: 'deferment' }
    }
    return { type, days: null, configured: false, kind: 'deferment' }
  }
  return { type: null, days: null, configured: false, kind: 'unknown' }
}

export function computeDueDateFromTerms(docDateKey, terms) {
  if (!docDateKey || !terms?.configured) return null
  return addCalendarDays(docDateKey, terms.days ?? 0)
}

export function deriveObligationStatus(obligation, todayKey = toAqtobeDateKey()) {
  const debt = Number(obligation?.currentDebt ?? obligation?.current_debt ?? 0)
  if (!Number.isFinite(debt) || debt <= 0) return OBLIGATION_STATUS.PAID
  if (obligation?.isSourceDeleted || obligation?.is_source_deleted) return OBLIGATION_STATUS.PAID

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

export function formatPaymentTermsSnapshot(obligation) {
  const type =
    obligation?.paymentTermsTypeSnapshot || obligation?.payment_terms_type_snapshot || null
  const days = obligation?.defermentDaysSnapshot ?? obligation?.deferment_days_snapshot
  if (!type) return 'Не настроено'
  const label = PAYMENT_TYPE_LABELS[type] || type
  if (isDeferralPaymentType(type) && days != null) {
    return `${label} — ${days} дн.`
  }
  if (isImmediatePaymentType(type)) {
    return `${label} (сразу)`
  }
  return label
}

export function isActiveOpenObligation(obligation) {
  if (!obligation) return false
  if (obligation.isSourceDeleted || obligation.is_source_deleted) return false
  return Number(obligation.currentDebt ?? obligation.current_debt ?? 0) > 0
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
    const debt = Number(ob.currentDebt ?? ob.current_debt ?? 0)
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

  return {
    summaries,
    dateGroups: [...overdueDates, ...todayDates, ...futureDates],
    termsMissing: [...termsMissingGroups.values()].sort((a, b) => b.amount - a.amount),
    activeCount: active.length,
  }
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
    const debt = Number(ob.currentDebt ?? ob.current_debt ?? 0)
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
