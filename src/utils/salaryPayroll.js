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
 * Отображение строки ведомости.
 * Удержания в колонке = все удержания минус аванс (аванс — отдельная колонка).
 * Остаток = к выдаче − выплачено (частичная выплата через paid_amount).
 */
export function getPayrollLedgerAmounts(record, advanceAmount = 0) {
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

  const advance = toMoneyNumber(advanceAmount)
  const totalDeductions = toMoneyNumber(record.totalDeductions)
  const otherDeductions = Math.max(0, toMoneyNumber(totalDeductions - advance))
  const payable = toMoneyNumber(record.totalPayable)
  const paid = resolvePaidAmount(record, payable)

  return {
    baseSalary: toMoneyNumber(record.baseSalary),
    allowances: toMoneyNumber(record.totalAllowances),
    deductions: otherDeductions,
    payable,
    advance,
    remainder: toMoneyNumber(Math.max(0, payable - paid)),
    paid,
  }
}

/** Итоговая выплаченная сумма; legacy status=paid → полная сумма к выдаче. */
export function resolvePaidAmount(record, payableOverride = null) {
  if (!record) return 0
  if (record.paidAmount != null && record.paidAmount !== '') {
    return toMoneyNumber(record.paidAmount)
  }
  const payable =
    payableOverride != null ? toMoneyNumber(payableOverride) : toMoneyNumber(record.totalPayable)
  return record.status === 'paid' ? payable : 0
}

/** Проверка: выплачено не больше «К выдаче» и не отрицательное. */
export function validatePaidAmount(paidAmount, payable) {
  const paid = toMoneyNumber(paidAmount)
  const maxPayable = toMoneyNumber(payable)
  if (paid < 0) {
    return { ok: false, message: 'Сумма «Выплачено» не может быть отрицательной' }
  }
  if (paid > maxPayable) {
    return {
      ok: false,
      message: `Нельзя выплатить больше суммы «К выдаче» (${formatMoneyKzt(maxPayable)})`,
    }
  }
  return { ok: true, paid }
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

  return (rows || []).reduce((acc, row) => {
    const { record, advanceAmount = 0 } = row
    const amounts = getPayrollLedgerAmounts(record, advanceAmount)
    if (!record) return acc
    acc.countWithRecord += 1
    acc.baseSalary += amounts.baseSalary || 0
    acc.allowances += amounts.allowances || 0
    acc.deductions += amounts.deductions || 0
    acc.payable += amounts.payable || 0
    acc.advance += amounts.advance || 0
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

function pad2(value) {
  return String(value).padStart(2, '0')
}

/** YYYY-MM-DD for payroll membership checks (hire / termination / month bounds). */
function toPayrollDateKey(value) {
  if (value == null || value === '') return null
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/)
    return match ? match[1] : null
  }
  return null
}

/** Границы расчётного месяца как YYYY-MM-DD (включительно). */
export function getPayrollMonthBounds(year, month) {
  const y = Number(year)
  const m = Number(month)
  const start = `${y}-${pad2(m)}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${y}-${pad2(m)}-${pad2(lastDay)}`
  return { start, end }
}

/**
 * Сотрудник попадает в ведомость, если период работы пересекается
 * с расчётным месяцем хотя бы на один календарный день.
 * Дата увольнения отсутствует → сотрудник считается работающим дальше.
 * Статус Работает/Уволен здесь не используется.
 */
export function employmentOverlapsPayrollMonth(employee, year, month) {
  const hiredAt = toPayrollDateKey(employee?.hiredAt ?? employee?.hired_at)
  if (!hiredAt) return false

  const { start: periodStart, end: periodEnd } = getPayrollMonthBounds(year, month)
  const terminatedAt = toPayrollDateKey(employee?.terminatedAt ?? employee?.terminated_at)
  const employmentEnd = terminatedAt || '9999-12-31'

  return hiredAt <= periodEnd && employmentEnd >= periodStart
}

/**
 * Состав ведомости за месяц:
 * — сотрудники с пересечением периода работы;
 * — плюс сотрудники из includeEmployeeIds (уже есть salary_record — история).
 */
export function selectEmployeesForPayrollMonth(
  employees,
  year,
  month,
  { includeEmployeeIds = [] } = {}
) {
  const byId = new Map()

  for (const employee of employees || []) {
    if (!employee?.id) continue
    if (employmentOverlapsPayrollMonth(employee, year, month)) {
      byId.set(Number(employee.id), employee)
    }
  }

  const index = new Map(
    (employees || [])
      .filter((employee) => employee?.id != null)
      .map((employee) => [Number(employee.id), employee])
  )

  for (const rawId of includeEmployeeIds || []) {
    const id = Number(rawId)
    if (!Number.isFinite(id) || byId.has(id)) continue
    const employee = index.get(id)
    if (employee) byId.set(id, employee)
  }

  return [...byId.values()].sort((left, right) =>
    String(left.name || '').localeCompare(String(right.name || ''), 'ru')
  )
}
