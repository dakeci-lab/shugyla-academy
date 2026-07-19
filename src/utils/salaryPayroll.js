/** Domain helpers for payroll MVP (Excel-like manual calculation). */

import {
  SALARY_CALCULATION_TYPE,
  normalizeSalaryCalculationType,
} from './employeeData'
import { isWorkingShiftStatus } from './shiftData'
import { deriveTrackerStatus } from './shiftWorkWindow'

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
 * Режим колонки «Ставка» по типу расчёта сотрудника.
 * fixed_salary → месячный оклад (base_salary);
 * shift_based → стоимость одной смены (shift_rate).
 * Подсказка в ячейке: «Оклад» / «За смену».
 */
export function getPayrollBaseColumnMode(employeeOrType) {
  const type =
    employeeOrType && typeof employeeOrType === 'object'
      ? normalizeSalaryCalculationType(
          employeeOrType.salaryCalculationType ?? employeeOrType.salary_calculation_type
        )
      : normalizeSalaryCalculationType(employeeOrType)

  if (type === SALARY_CALCULATION_TYPE.FIXED_SALARY) {
    return {
      mode: SALARY_CALCULATION_TYPE.FIXED_SALARY,
      label: 'Оклад',
      ariaLabel: 'Редактировать ставку (оклад)',
    }
  }

  return {
    mode: SALARY_CALCULATION_TYPE.SHIFT_BASED,
    label: 'За смену',
    ariaLabel: 'Редактировать ставку (за смену)',
  }
}

export function isPayrollShiftBased(employeeOrType) {
  return getPayrollBaseColumnMode(employeeOrType).mode === SALARY_CALCULATION_TYPE.SHIFT_BASED
}

/** Смена завершена в тайм-трекере (есть check-in и check-out). */
export function isPayrollCompletedShift(shift) {
  if (!isWorkingShiftStatus(shift?.status)) return false
  return deriveTrackerStatus(shift) === 'completed'
}

/** Назначенные (график) и подтверждённые (тайм-трекер) смены за период. */
export function countPayrollShiftStats(shifts = []) {
  let assigned = 0
  let completed = 0
  for (const shift of shifts) {
    if (!isWorkingShiftStatus(shift?.status)) continue
    assigned += 1
    if (isPayrollCompletedShift(shift)) completed += 1
  }
  return { assigned, completed }
}

/** Склонение: 1 смена / 2 смены / 5 смен */
export function formatPayrollShiftsCountLabel(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} смена`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} смены`
  return `${n} смен`
}

/**
 * Смена учитывается в зарплате только внутри периода работы сотрудника
 * (от даты приёма до даты увольнения включительно).
 */
export function isShiftWithinEmploymentPeriod(shift, employee) {
  const shiftDate = toPayrollDateKey(shift?.shiftDate ?? shift?.shift_date)
  if (!shiftDate) return false
  if (!employee) return true

  const hiredAt = toPayrollDateKey(employee?.hiredAt ?? employee?.hired_at)
  if (hiredAt && shiftDate < hiredAt) return false

  const terminatedAt = toPayrollDateKey(employee?.terminatedAt ?? employee?.terminated_at)
  if (terminatedAt && shiftDate > terminatedAt) return false

  return true
}

/**
 * Map<employeeId, { assigned, completed }> from a month shift list.
 * Optional employeesById clips shifts outside hire/termination dates
 * (mid-month terminations must not count post-termination schedule rows).
 */
export function buildPayrollShiftStatsByEmployee(shifts = [], employeesById = null) {
  const byEmployee = new Map()
  for (const shift of shifts || []) {
    const id = Number(shift?.employeeId ?? shift?.employee_id)
    if (!Number.isFinite(id)) continue
    if (employeesById) {
      const employee = employeesById.get(id) ?? employeesById.get(String(id))
      if (employee && !isShiftWithinEmploymentPeriod(shift, employee)) continue
    }
    if (!byEmployee.has(id)) byEmployee.set(id, [])
    byEmployee.get(id).push(shift)
  }

  const stats = new Map()
  for (const [id, list] of byEmployee) {
    stats.set(id, countPayrollShiftStats(list))
  }
  return stats
}

export function getPayrollShiftStatsForEmployee(shiftStatsByEmployee, employeeId) {
  return (
    shiftStatsByEmployee?.get(Number(employeeId)) || {
      assigned: 0,
      completed: 0,
    }
  )
}

/** Ставка: оклад или стоимость смены (не путать с заработанной базой в base_salary у сменщиков). */
export function getPayrollRateAmount(record, employee) {
  if (!record) return 0
  if (isPayrollShiftBased(employee)) return toMoneyNumber(record.shiftRate)
  return toMoneyNumber(record.baseSalary)
}

/**
 * Фонд оплаты — прогноз обязательств:
 * fixed → полный оклад; shift → ставка × назначенные смены в графике.
 */
export function computePayrollFundAmount(record, employee, shiftStats = null) {
  const rate = getPayrollRateAmount(record, employee)
  if (!isPayrollShiftBased(employee)) return rate
  const assigned = Number(shiftStats?.assigned) || 0
  return toMoneyNumber(rate * assigned)
}

/**
 * Заработанная база до начислений/удержаний:
 * fixed → полный оклад (временно без посещаемости);
 * shift → ставка × подтверждённые смены (check-in/out).
 * Дальше сюда можно подключить KPI, отпуска, дисциплину без смены UI «Ставка».
 */
export function computePayrollEarnedBase(record, employee, shiftStats = null) {
  const rate = getPayrollRateAmount(record, employee)
  if (!isPayrollShiftBased(employee)) return rate
  const completed = Number(shiftStats?.completed) || 0
  return toMoneyNumber(rate * completed)
}

/**
 * Отображение строки ведомости.
 *
 * Сменщики (утверждённая архитектура):
 *   К выдаче = ставка × подтверждённые смены (+ начисления)
 *   Остаток  = К выдаче − удержания − аванс − выплачено
 *   Фонд     = ставка × назначенные смены (график)
 *
 * Окладники (без изменений):
 *   К выдаче = оклад + начисления − все удержания (вкл. аванс)
 *   Остаток  = К выдаче − выплачено
 */
export function getPayrollLedgerAmounts(
  record,
  advanceAmount = 0,
  employee = null,
  shiftStats = null
) {
  const column = getPayrollBaseColumnMode(employee)
  const isShift = column.mode === SALARY_CALCULATION_TYPE.SHIFT_BASED
  const stats = shiftStats || { assigned: 0, completed: 0 }

  if (!record) {
    return {
      baseSalary: null,
      baseColumnValue: null,
      baseColumnLabel: column.label,
      baseColumnMode: column.mode,
      baseColumnDetail: isShift ? `План: ${formatPayrollShiftsCountLabel(0)}` : '',
      payableDetail: isShift ? 'Отработано: 0' : '',
      allowances: null,
      deductions: null,
      payable: null,
      advance: null,
      remainder: null,
      paid: null,
      assignedShifts: null,
      completedShifts: null,
    }
  }

  const advance = toMoneyNumber(advanceAmount)
  const totalDeductions = toMoneyNumber(record.totalDeductions)
  const otherDeductions = Math.max(0, toMoneyNumber(totalDeductions - advance))
  const allowances = toMoneyNumber(record.totalAllowances)
  const rate = getPayrollRateAmount(record, employee)
  const fund = computePayrollFundAmount(record, employee, shiftStats)
  const earnedBase = computePayrollEarnedBase(record, employee, shiftStats)
  const assignedShifts = Number(stats.assigned) || 0
  const completedShifts = Number(stats.completed) || 0

  let payable
  let remainder
  const paidStored = resolvePaidAmount(record, null)

  if (isShift) {
    // Не вычитаем удержания/аванс из «К выдаче» — иначе при earned=0 получались отрицательные суммы.
    payable = toMoneyNumber(earnedBase + allowances)
    const paid = paidStored
    remainder = toMoneyNumber(
      Math.max(0, payable - otherDeductions - advance - paid)
    )
    return {
      baseSalary: fund,
      baseColumnValue: rate,
      baseColumnLabel: column.label,
      baseColumnMode: column.mode,
      baseColumnDetail: `План: ${formatPayrollShiftsCountLabel(assignedShifts)}`,
      payableDetail: `Отработано: ${completedShifts}`,
      allowances,
      deductions: otherDeductions,
      payable,
      advance,
      remainder,
      paid,
      assignedShifts,
      completedShifts,
    }
  }

  payable = toMoneyNumber(earnedBase + allowances - totalDeductions)
  const paid = resolvePaidAmount(record, payable)
  remainder = toMoneyNumber(Math.max(0, payable - paid))

  return {
    baseSalary: fund,
    baseColumnValue: rate,
    baseColumnLabel: column.label,
    baseColumnMode: column.mode,
    baseColumnDetail: '',
    payableDetail: '',
    allowances,
    deductions: otherDeductions,
    payable,
    advance,
    remainder,
    paid,
    assignedShifts,
    completedShifts,
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

/** Проверка: выплачено не больше допустимого потолка и не отрицательное. */
export function validatePaidAmount(paidAmount, maxAllowed) {
  const paid = toMoneyNumber(paidAmount)
  const maxPayable = toMoneyNumber(maxAllowed)
  if (paid < 0) {
    return { ok: false, message: 'Сумма «Выплачено» не может быть отрицательной' }
  }
  if (paid > maxPayable) {
    return {
      ok: false,
      message: `Нельзя выплатить больше допустимой суммы (${formatMoneyKzt(maxPayable)})`,
    }
  }
  return { ok: true, paid }
}

/** Максимум для «Выплачено»: у сменщиков — после удержаний и аванса. */
export function getPayrollPaidCap(amounts, employee) {
  if (!amounts) return 0
  if (isPayrollShiftBased(employee)) {
    return toMoneyNumber(
      Math.max(
        0,
        toMoneyNumber(amounts.payable) -
          toMoneyNumber(amounts.deductions) -
          toMoneyNumber(amounts.advance)
      )
    )
  }
  return toMoneyNumber(amounts.payable)
}

/** Empty aggregate for payroll ledger totals (summary cards + ИТОГО). */
export function createEmptyPayrollLedgerTotals() {
  return {
    baseSalary: 0,
    allowances: 0,
    deductions: 0,
    payable: 0,
    advance: 0,
    remainder: 0,
    paid: 0,
    countWithRecord: 0,
  }
}

/**
 * Single aggregation used by both the top summary panel and the table ИТОГО row.
 * Prefer rows that already carry `amounts` from getPayrollLedgerAmounts — same objects
 * as table cells — so panel and footer cannot diverge.
 */
export function sumPayrollLedgerRows(rows) {
  return (rows || []).reduce((acc, row) => {
    const amounts =
      row?.amounts ||
      (row?.record
        ? getPayrollLedgerAmounts(
            row.record,
            row.advanceAmount || 0,
            row.employee,
            row.shiftStats
          )
        : null)
    if (!amounts || row?.record == null) return acc
    acc.countWithRecord += 1
    acc.baseSalary += amounts.baseSalary || 0
    acc.allowances += amounts.allowances || 0
    acc.deductions += amounts.deductions || 0
    acc.payable += amounts.payable || 0
    acc.advance += amounts.advance || 0
    acc.remainder += amounts.remainder || 0
    acc.paid += amounts.paid || 0
    return acc
  }, createEmptyPayrollLedgerTotals())
}

/**
 * К выдаче = заработанная база + начисления − удержания.
 * Для сменщиков база = ставка × подтверждённые смены (пишется в base_salary при sync).
 * Для окладников база = полный оклад (позже — посещаемость / KPI / отпуска).
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
