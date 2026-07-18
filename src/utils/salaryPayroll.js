/** Domain helpers for payroll MVP (Excel-like manual calculation). */

export const SALARY_RECORD_STATUSES = [
  { id: 'draft', label: 'Черновик', badge: 'draft' },
  { id: 'review', label: 'На проверке', badge: 'progress' },
  { id: 'confirmed', label: 'Подтверждено', badge: 'done' },
  { id: 'paid', label: 'Выплачено', badge: 'passed' },
]

export const SALARY_ALLOWANCE_PRESETS = [
  { kind: 'premium', title: 'Премия' },
  { kind: 'bonus', title: 'Бонус' },
  { kind: 'supplement', title: 'Доплата' },
]

export const SALARY_DEDUCTION_PRESETS = [
  { kind: 'fine', title: 'Штраф' },
  { kind: 'advance', title: 'Аванс' },
  { kind: 'deduction', title: 'Удержание' },
]

export function getSalaryStatusMeta(statusId) {
  return (
    SALARY_RECORD_STATUSES.find((item) => item.id === statusId) ||
    SALARY_RECORD_STATUSES[0]
  )
}

export function toMoneyNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

export function formatMoneyKzt(value) {
  const amount = toMoneyNumber(value)
  const formatted = amount.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  return `${formatted} ₸`
}

/** Компактный формат для колонок ведомости (без символа валюты в каждой ячейке). */
export function formatMoneyCompact(value) {
  if (value == null || value === '') return '—'
  const amount = toMoneyNumber(value)
  return amount.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

/**
 * Отображение строки ведомости из полей salary_records.
 * Аванс пока без отдельного поля в БД — «—».
 * Выплачено / остаток выводятся по статусу paid (без новых формул расчёта).
 */
export function getPayrollLedgerAmounts(record) {
  if (!record) {
    return {
      baseSalary: null,
      allowances: null,
      deductions: null,
      payable: null,
      advance: null,
      remainder: null,
      paid: null,
    }
  }

  const payable = toMoneyNumber(record.totalPayable)
  const isPaid = record.status === 'paid'

  return {
    baseSalary: toMoneyNumber(record.baseSalary),
    allowances: toMoneyNumber(record.totalAllowances),
    deductions: toMoneyNumber(record.totalDeductions),
    payable,
    advance: null,
    remainder: isPaid ? 0 : payable,
    paid: isPaid ? payable : 0,
  }
}

export function sumPayrollLedgerRows(rows) {
  const empty = {
    baseSalary: 0,
    allowances: 0,
    deductions: 0,
    payable: 0,
    advance: 0,
    remainder: 0,
    paid: 0,
    countWithRecord: 0,
  }

  return (rows || []).reduce((acc, { record }) => {
    const amounts = getPayrollLedgerAmounts(record)
    if (!record) return acc
    acc.countWithRecord += 1
    acc.baseSalary += amounts.baseSalary || 0
    acc.allowances += amounts.allowances || 0
    acc.deductions += amounts.deductions || 0
    acc.payable += amounts.payable || 0
    acc.remainder += amounts.remainder || 0
    acc.paid += amounts.paid || 0
    return acc
  }, empty)
}

/**
 * Excel-like MVP:
 * к выдаче = оклад + начисления − удержания
 * work_hours / work_shifts пока не влияют на сумму (ручной учёт).
 */
export function computeSalaryTotals({
  baseSalary = 0,
  allowances = [],
  deductions = [],
} = {}) {
  const base = toMoneyNumber(baseSalary)
  const totalAllowances = toMoneyNumber(
    (allowances || []).reduce((sum, row) => sum + toMoneyNumber(row.amount), 0)
  )
  const totalDeductions = toMoneyNumber(
    (deductions || []).reduce((sum, row) => sum + toMoneyNumber(row.amount), 0)
  )
  const totalPayable = toMoneyNumber(base + totalAllowances - totalDeductions)
  return {
    totalAllowances,
    totalDeductions,
    totalPayable,
  }
}

export function getPayrollListPath() {
  return '/platform/employees/payroll'
}

export function getPayrollRecordPath(recordId) {
  return `/platform/employees/payroll/records/${recordId}`
}

export function changePayrollMonth(year, month, delta) {
  const date = new Date(year, month - 1 + delta, 1)
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  }
}
