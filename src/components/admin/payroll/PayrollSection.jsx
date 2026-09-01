import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { isCloudMode } from '../../../lib/dataMode'
import { getEmployeeProfilePath } from '../../../config/permissions'
import { getEmployeePositionDisplay } from '../../../utils/employeeData'
import { normalizeRoleId } from '../../../data/roles'
import { formatMonthYearLabel } from '../../../utils/shiftData'
import {
  SALARY_ALLOWANCE_PRESETS,
  SALARY_DEDUCTION_PRESETS,
  buildPayrollShiftStatsByEmployee,
  formatMoneyCompact,
  formatPayrollTotalsLabel,
  getPayrollBaseColumnMode,
  getPayrollCurrentMonthState,
  getPayrollLedgerAmounts,
  getPayrollPaidCap,
  getPayrollShiftStatsForEmployee,
  isPayrollShiftBased,
  selectEmployeesForPayrollMonth,
  sumPayrollLedgerRows,
  toMoneyNumber,
  validatePaidAmount,
} from '../../../utils/salaryPayroll'
import { SALARY_CALCULATION_TYPE } from '../../../utils/employeeData'
import { DelayedLoadingSkeleton } from '../../loading/LoadingSkeleton'
import {
  getEmployeeForAdmin,
  listEmployeesForAdmin,
} from '../../../services/employeeAdminService'
import {
  PAYROLL_PARTICIPATION,
  PAYROLL_LIST_DEFAULT_SHOW_EXCLUDED,
  isPayrollExcluded,
  normalizePayrollParticipation,
} from '../../../utils/employeeData'
import { updateEmployee } from '../../../services/platformDataService'
import { fetchTeamWorkforceForMonth } from '../../../services/workforceAdminService'
import {
  addSalaryAllowance,
  addSalaryDeduction,
  deleteSalaryAllowance,
  deleteSalaryDeduction,
  ensureSalaryPeriod,
  ensureSalaryRecord,
  getSalaryRecordBundle,
  listAdvanceLinesForRecords,
  listSalaryRecordsForPeriod,
  syncShiftBasedEarnedBase,
  updateSalaryAllowance,
  updateSalaryDeduction,
  updateSalaryRecordFields,
  upsertSalaryAdvance,
} from '../../../services/salaryPayrollService'
import { usePlatformPageRefresh } from '../../../context/PullToRefreshContext'
import { useToast } from '../../../context/ToastContext'
import { CommentIcon, FilterIcon } from '../../icons/PlatformIcons'
import PlatformSearchToolbar, {
  PlatformToolbarActionWrap,
} from '../../platform/PlatformSearchToolbar'
import PayrollFilterPopover from './PayrollFilterPopover'
import PayrollCommentModal from './PayrollCommentModal'
import PayrollInlineMoneyCell from './PayrollInlineMoneyCell'
import PayrollLinesModal from './PayrollLinesModal'
import '../admin-shared.css'
import '../EmployeeSchedule.css'
import './PayrollSection.css'

const EMPLOYEE_PAGE_SIZE = 100
const DEDUCTION_PRESETS = SALARY_DEDUCTION_PRESETS.filter((item) => item.kind !== 'advance')
const PAYROLL_UI_STORAGE_KEY = 'platform-payroll-ledger-ui'

function readPayrollUiState() {
  try {
    const raw = sessionStorage.getItem(PAYROLL_UI_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function writePayrollUiState(state) {
  try {
    sessionStorage.setItem(PAYROLL_UI_STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore quota / private mode */
  }
}

/** Stable academy_users.id → existing employee card route. Never resolve by name. */
function getPayrollEmployeeLink(employee) {
  const id = Number(employee?.id)
  if (!Number.isFinite(id) || id <= 0) {
    if (import.meta.env.DEV) {
      console.warn('[payroll] employee row missing stable id; name left non-clickable', {
        name: employee?.name ?? null,
      })
    }
    return null
  }
  return getEmployeeProfilePath(id)
}

/** Все сотрудники (без фильтра по статусу) — состав ведомости режется по датам. */
async function listAllStaffEmployeesForPayroll() {
  const employees = []
  let page = 1
  let totalPages = 1

  do {
    const result = await listEmployeesForAdmin({
      page,
      pageSize: EMPLOYEE_PAGE_SIZE,
      status: 'all',
      sortBy: 'full_name',
      sortDirection: 'asc',
    })
    employees.push(...(result.employees || []))
    totalPages = Number(result.pagination?.total_pages) || 1
    page += 1
  } while (page <= totalPages)

  return employees
}

/**
 * Сотрудники ведомости за месяц:
 * пересечение периода работы + сотрудники с уже существующими записями (история).
 */
async function listEmployeesForPayrollMonth(year, month, records) {
  const staff = await listAllStaffEmployeesForPayroll()
  const recordEmployeeIds = (records || []).map((row) => Number(row.employeeId))
  let selected = selectEmployeesForPayrollMonth(staff, year, month, {
    includeEmployeeIds: recordEmployeeIds,
  })

  const selectedIds = new Set(selected.map((employee) => Number(employee.id)))
  const missingIds = recordEmployeeIds.filter(
    (id) => Number.isFinite(id) && !selectedIds.has(id)
  )

  if (missingIds.length > 0) {
    const extras = await Promise.all(
      missingIds.map(async (employeeId) => {
        try {
          return await getEmployeeForAdmin(employeeId, { allowSearchFallback: false })
        } catch {
          return null
        }
      })
    )
    selected = selectEmployeesForPayrollMonth([...staff, ...extras.filter(Boolean)], year, month, {
      includeEmployeeIds: recordEmployeeIds,
    })
  }

  return selected
}

function hasRecordNotes(record) {
  return Boolean(String(record?.notes || '').trim())
}

function TotalsMoney({ value }) {
  return <td className="payroll-table__money">{formatMoneyCompact(value)}</td>
}

/** Зарплатная ведомость с редактированием прямо в таблице */
export default function PayrollSection() {
  const { warning: showWarning, success: showSuccess } = useToast()
  const filterButtonRef = useRef(null)
  const restoredUiRef = useRef(readPayrollUiState())
  const scrollRestoredRef = useRef(false)

  const [{ year, month }, setMonthState] = useState(() => {
    const saved = restoredUiRef.current
    if (
      saved &&
      Number.isFinite(Number(saved.year)) &&
      Number.isFinite(Number(saved.month)) &&
      saved.month >= 1 &&
      saved.month <= 12
    ) {
      return { year: Number(saved.year), month: Number(saved.month) }
    }
    return getPayrollCurrentMonthState()
  })
  const [draftYear, setDraftYear] = useState(year)
  const [draftMonth, setDraftMonth] = useState(month)
  const [search, setSearch] = useState(() =>
    typeof restoredUiRef.current?.search === 'string' ? restoredUiRef.current.search : '',
  )
  const [appliedRoleId, setAppliedRoleId] = useState(() =>
    typeof restoredUiRef.current?.appliedRoleId === 'string'
      ? restoredUiRef.current.appliedRoleId
      : '',
  )
  const [appliedShowExcluded, setAppliedShowExcluded] = useState(() =>
    typeof restoredUiRef.current?.appliedShowExcluded === 'boolean'
      ? restoredUiRef.current.appliedShowExcluded
      : PAYROLL_LIST_DEFAULT_SHOW_EXCLUDED,
  )
  const [draftRoleId, setDraftRoleId] = useState(() =>
    typeof restoredUiRef.current?.appliedRoleId === 'string'
      ? restoredUiRef.current.appliedRoleId
      : '',
  )
  const [draftShowExcluded, setDraftShowExcluded] = useState(() =>
    typeof restoredUiRef.current?.appliedShowExcluded === 'boolean'
      ? restoredUiRef.current.appliedShowExcluded
      : PAYROLL_LIST_DEFAULT_SHOW_EXCLUDED,
  )
  const [filterOpen, setFilterOpen] = useState(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [employees, setEmployees] = useState([])
  const [recordsByEmployee, setRecordsByEmployee] = useState(new Map())
  const [advancesByRecordId, setAdvancesByRecordId] = useState(new Map())
  const [shiftStatsByEmployee, setShiftStatsByEmployee] = useState(new Map())
  const [period, setPeriod] = useState(null)
  const [savingEmployeeId, setSavingEmployeeId] = useState(null)

  const [commentTarget, setCommentTarget] = useState(null)
  const [commentSaving, setCommentSaving] = useState(false)
  const [commentExcluding, setCommentExcluding] = useState(false)
  const [linesTarget, setLinesTarget] = useState(null)

  const load = useCallback(
    async (options = {}) => {
      const quiet = options?.quiet === true
      if (!quiet) setLoading(true)
      setError('')
      try {
        if (!isCloudMode()) {
          setEmployees([])
          setRecordsByEmployee(new Map())
          setAdvancesByRecordId(new Map())
          setShiftStatsByEmployee(new Map())
          setPeriod(null)
          setError('Подсчёт зарплаты доступен только в облачном режиме')
          return
        }

        const nextPeriod = await ensureSalaryPeriod(year, month)
        setPeriod(nextPeriod)

        const records = await listSalaryRecordsForPeriod(nextPeriod.id)
        const employeeRows = await listEmployeesForPayrollMonth(year, month, records)
        // Team shifts must go through admin-team-workforce-data (service role).
        // Direct academy_employee_shifts select is RLS-scoped to the caller's own rows,
        // so payroll would see Plan/Worked = 0 for every other employee.
        const [advances, workforceBundle] = await Promise.all([
          listAdvanceLinesForRecords(records.map((row) => row.id)),
          fetchTeamWorkforceForMonth(year, month, 'payroll'),
        ])
        const monthShifts = workforceBundle.shifts
        const employeesById = new Map(
          employeeRows.map((row) => [Number(row.id), row])
        )
        // Period-based stats: include terminated staff; clip shifts after termination.
        const shiftStats = buildPayrollShiftStatsByEmployee(
          monthShifts,
          employeesById,
          year,
          month,
        )

        if (import.meta.env.DEV) {
          for (const employee of employeeRows) {
            if (!isPayrollShiftBased(employee)) continue
            const employeeShifts = monthShifts.filter(
              (shift) => Number(shift.employeeId) === Number(employee.id)
            )
            const stats = getPayrollShiftStatsForEmployee(shiftStats, employee.id)
            console.info('[payroll-shift-diagnostics]', {
              employeeId: employee.id,
              name: employee.name,
              period: `${year}-${String(month).padStart(2, '0')}`,
              scheduleRows: employeeShifts.length,
              assignedWorking: stats.assigned,
              completedTracker: stats.completed,
              employmentStatus: employee.employmentStatus,
              terminatedAt: employee.terminatedAt ?? null,
              source: 'admin-team-workforce-data:payroll',
              zeroReason:
                employeeShifts.length === 0
                  ? 'no_shifts_in_workforce_bundle'
                  : stats.assigned === 0
                    ? 'no_working_status_rows_in_employment_period'
                    : stats.completed === 0
                      ? 'no_check_in_check_out_pairs'
                      : null,
            })
          }
        }

        const syncedRecords = await Promise.all(
          records.map(async (record) => {
            const employee = employeesById.get(Number(record.employeeId))
            if (!employee || !isPayrollShiftBased(employee)) return record
            const stats = getPayrollShiftStatsForEmployee(shiftStats, record.employeeId)
            return syncShiftBasedEarnedBase(record, employee, stats)
          })
        )

        setEmployees(employeeRows)
        const map = new Map()
        for (const record of syncedRecords) {
          map.set(Number(record.employeeId), record)
        }
        setRecordsByEmployee(map)
        setAdvancesByRecordId(advances)
        setShiftStatsByEmployee(shiftStats)
      } catch (err) {
        setError(err?.message || 'Не удалось загрузить расчёты')
        setEmployees([])
        setRecordsByEmployee(new Map())
        setAdvancesByRecordId(new Map())
        setShiftStatsByEmployee(new Map())
      } finally {
        if (!quiet) setLoading(false)
      }
    },
    [year, month]
  )

  useEffect(() => {
    void load()
  }, [load])

  usePlatformPageRefresh(
    useCallback(async () => {
      await load({ quiet: true })
    }, [load])
  )

  const persistPayrollUiState = useCallback(
    (overrides = {}) => {
      writePayrollUiState({
        year,
        month,
        search,
        appliedRoleId,
        appliedShowExcluded,
        scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
        ...overrides,
      })
    },
    [year, month, search, appliedRoleId, appliedShowExcluded],
  )

  useEffect(() => {
    persistPayrollUiState()
  }, [persistPayrollUiState])

  useEffect(() => {
    if (loading || scrollRestoredRef.current) return undefined
    const savedY = Number(restoredUiRef.current?.scrollY)
    if (!Number.isFinite(savedY) || savedY <= 0) {
      scrollRestoredRef.current = true
      return undefined
    }
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo(0, savedY)
      scrollRestoredRef.current = true
    })
    return () => window.cancelAnimationFrame(frame)
  }, [loading])

  const patchEmployeeRecord = useCallback((employeeId, record, advanceMeta = undefined) => {
    setRecordsByEmployee((prev) => {
      const map = new Map(prev)
      map.set(Number(employeeId), record)
      return map
    })
    if (advanceMeta !== undefined) {
      setAdvancesByRecordId((prev) => {
        const map = new Map(prev)
        if (!advanceMeta || toMoneyNumber(advanceMeta.amount) <= 0) {
          map.delete(record.id)
        } else {
          map.set(record.id, advanceMeta)
        }
        return map
      })
    }
  }, [])

  const ensureRowRecord = useCallback(
    async (employee) => {
      if (!period) throw new Error('Период не загружен')
      const existing = recordsByEmployee.get(Number(employee.id))
      if (existing) return existing
      let record = await ensureSalaryRecord(period.id, employee.id)
      if (isPayrollShiftBased(employee)) {
        const stats = getPayrollShiftStatsForEmployee(shiftStatsByEmployee, employee.id)
        record = await syncShiftBasedEarnedBase(record, employee, stats)
      }
      patchEmployeeRecord(employee.id, record)
      return record
    },
    [period, recordsByEmployee, patchEmployeeRecord, shiftStatsByEmployee]
  )

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees
      .filter((emp) => {
        if (
          appliedRoleId &&
          normalizeRoleId(emp.role) !== normalizeRoleId(appliedRoleId)
        ) {
          return false
        }
        if (isPayrollExcluded(emp) !== appliedShowExcluded) {
          return false
        }
        if (!q) return true
        return String(emp.name || '').toLowerCase().includes(q)
      })
      .map((emp) => {
        const record = recordsByEmployee.get(Number(emp.id)) || null
        const advanceAmount = record
          ? advancesByRecordId.get(record.id)?.amount || 0
          : 0
        const shiftStats = getPayrollShiftStatsForEmployee(shiftStatsByEmployee, emp.id)
        const amounts = getPayrollLedgerAmounts(record, advanceAmount, emp, shiftStats)
        return { employee: emp, record, advanceAmount, shiftStats, amounts }
      })
  }, [
    employees,
    recordsByEmployee,
    advancesByRecordId,
    shiftStatsByEmployee,
    search,
    appliedRoleId,
    appliedShowExcluded,
  ])

  // Single source for table ИТОГО — summed from visible (search/filter) row.amounts.
  const totals = useMemo(() => sumPayrollLedgerRows(rows), [rows])
  const periodLabel = useMemo(() => formatMonthYearLabel(year, month), [year, month])
  const totalsLabel = useMemo(() => formatPayrollTotalsLabel(year, month), [year, month])

  const draftPreviewCount = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter((emp) => {
      if (
        draftRoleId &&
        normalizeRoleId(emp.role) !== normalizeRoleId(draftRoleId)
      ) {
        return false
      }
      if (isPayrollExcluded(emp) !== draftShowExcluded) {
        return false
      }
      if (!q) return true
      return String(emp.name || '').toLowerCase().includes(q)
    }).length
  }, [
    employees,
    search,
    draftRoleId,
    draftShowExcluded,
  ])

  const filtersActive =
    Boolean(appliedRoleId) || appliedShowExcluded !== PAYROLL_LIST_DEFAULT_SHOW_EXCLUDED

  function toggleFilter() {
    if (filterOpen) {
      setFilterOpen(false)
      return
    }
    setDraftYear(year)
    setDraftMonth(month)
    setDraftRoleId(appliedRoleId)
    setDraftShowExcluded(appliedShowExcluded)
    setFilterOpen(true)
  }

  function applyFilters() {
    setMonthState({ year: Number(draftYear), month: Number(draftMonth) })
    setAppliedRoleId(draftRoleId)
    setAppliedShowExcluded(draftShowExcluded)
    setFilterOpen(false)
  }

  function resetFilters() {
    const current = getPayrollCurrentMonthState()
    setDraftYear(current.year)
    setDraftMonth(current.month)
    setDraftRoleId('')
    setDraftShowExcluded(PAYROLL_LIST_DEFAULT_SHOW_EXCLUDED)
    setMonthState(current)
    setAppliedRoleId('')
    setAppliedShowExcluded(PAYROLL_LIST_DEFAULT_SHOW_EXCLUDED)
    setFilterOpen(false)
  }

  function patchEmployeeLocal(employeeId, patch) {
    setEmployees((prev) =>
      prev.map((emp) =>
        Number(emp.id) === Number(employeeId) ? { ...emp, ...patch } : emp
      )
    )
    setCommentTarget((prev) =>
      prev && Number(prev.employee.id) === Number(employeeId)
        ? { ...prev, employee: { ...prev.employee, ...patch } }
        : prev
    )
  }

  async function persistPayrollParticipation(employee, nextParticipation) {
    const value = normalizePayrollParticipation(nextParticipation)
    await updateEmployee(employee.id, { payrollParticipation: value })
    patchEmployeeLocal(employee.id, { payrollParticipation: value })
    return value
  }

  async function handleSaveBaseColumn(employee, amount) {
    setSavingEmployeeId(employee.id)
    try {
      const record = await ensureRowRecord(employee)
      const { mode } = getPayrollBaseColumnMode(employee)
      let updated
      if (mode === SALARY_CALCULATION_TYPE.SHIFT_BASED) {
        const withRate = await updateSalaryRecordFields(record.id, { shiftRate: amount })
        const stats = getPayrollShiftStatsForEmployee(shiftStatsByEmployee, employee.id)
        updated = await syncShiftBasedEarnedBase(withRate, employee, stats)
      } else {
        updated = await updateSalaryRecordFields(record.id, { baseSalary: amount })
      }
      patchEmployeeRecord(employee.id, updated)
    } catch (err) {
      showWarning(err?.message || 'Не удалось сохранить ставку')
    } finally {
      setSavingEmployeeId(null)
    }
  }

  async function handleSaveAdvance(employee, amount) {
    setSavingEmployeeId(employee.id)
    try {
      const record = await ensureRowRecord(employee)
      const updated = await upsertSalaryAdvance(record.id, amount)
      patchEmployeeRecord(employee.id, updated)
      const advances = await listAdvanceLinesForRecords([updated.id])
      setAdvancesByRecordId((prev) => {
        const map = new Map(prev)
        map.delete(updated.id)
        const next = advances.get(updated.id)
        if (next) map.set(updated.id, next)
        return map
      })
    } catch (err) {
      showWarning(err?.message || 'Не удалось сохранить аванс')
    } finally {
      setSavingEmployeeId(null)
    }
  }

  async function handleSavePaid(employee, amount) {
    setSavingEmployeeId(employee.id)
    try {
      const record = await ensureRowRecord(employee)
      const advanceAmount = advancesByRecordId.get(record.id)?.amount || 0
      const stats = getPayrollShiftStatsForEmployee(shiftStatsByEmployee, employee.id)
      const amounts = getPayrollLedgerAmounts(record, advanceAmount, employee, stats)
      const check = validatePaidAmount(amount, getPayrollPaidCap(amounts, employee))
      if (!check.ok) {
        showWarning(check.message)
        return
      }
      const updated = await updateSalaryRecordFields(record.id, {
        paidAmount: check.paid,
      })
      patchEmployeeRecord(employee.id, updated)
    } catch (err) {
      showWarning(err?.message || 'Не удалось сохранить выплату')
    } finally {
      setSavingEmployeeId(null)
    }
  }

  async function handleOpenLines(employee, mode) {
    try {
      const record = await ensureRowRecord(employee)
      const bundle = await getSalaryRecordBundle(record.id)
      patchEmployeeRecord(employee.id, bundle.record)
      const lines =
        mode === 'allowances'
          ? bundle.allowances
          : bundle.deductions.filter((line) => line.kind !== 'advance')
      setLinesTarget({
        mode,
        employee,
        record: bundle.record,
        lines,
      })
    } catch (err) {
      showWarning(err?.message || 'Не удалось открыть строки')
    }
  }

  async function refreshLinesTarget(recordId, employee, mode) {
    const bundle = await getSalaryRecordBundle(recordId)
    patchEmployeeRecord(employee.id, bundle.record)
    if (mode === 'deductions' && period) {
      const advances = await listAdvanceLinesForRecords([recordId])
      setAdvancesByRecordId((prev) => {
        const map = new Map(prev)
        map.delete(recordId)
        const next = advances.get(recordId)
        if (next) map.set(recordId, next)
        return map
      })
    }
    const lines =
      mode === 'allowances'
        ? bundle.allowances
        : bundle.deductions.filter((line) => line.kind !== 'advance')
    setLinesTarget((prev) =>
      prev && prev.record.id === recordId
        ? { ...prev, record: bundle.record, lines }
        : prev
    )
    return { bundle, lines }
  }

  async function handleOpenComment(employee, record) {
    if (commentSaving) return
    try {
      let nextRecord = record
      if (!nextRecord) nextRecord = await ensureRowRecord(employee)
      setCommentTarget({ employee, record: nextRecord })
    } catch (err) {
      showWarning(err?.message || 'Не удалось открыть комментарий')
    }
  }

  async function handleSaveComment({ notes, payrollParticipation }) {
    if (!commentTarget?.record) return
    setCommentSaving(true)
    try {
      const nextParticipation = normalizePayrollParticipation(payrollParticipation)
      const currentParticipation = normalizePayrollParticipation(
        commentTarget.employee.payrollParticipation
      )
      if (nextParticipation !== currentParticipation) {
        await persistPayrollParticipation(commentTarget.employee, nextParticipation)
      }
      const updated = await updateSalaryRecordFields(commentTarget.record.id, {
        notes: notes.trim() || '',
      })
      patchEmployeeRecord(commentTarget.employee.id, updated)
      setCommentTarget(null)
      showSuccess('Сохранено')
    } catch (err) {
      showWarning(err?.message || 'Не удалось сохранить')
    } finally {
      setCommentSaving(false)
    }
  }

  async function handleExcludeFromPayroll() {
    if (!commentTarget?.employee || commentExcluding) return
    setCommentExcluding(true)
    try {
      await persistPayrollParticipation(
        commentTarget.employee,
        PAYROLL_PARTICIPATION.EXCLUDED
      )
      setCommentTarget(null)
      showSuccess('Сотрудник исключён из расчёта')
    } catch (err) {
      showWarning(err?.message || 'Не удалось исключить сотрудника')
    } finally {
      setCommentExcluding(false)
    }
  }

  return (
    <div className="payroll-section">
      <PlatformSearchToolbar
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Поиск по ФИО"
        ariaLabel="Поиск по ФИО"
        flush
        actions={
          <PlatformToolbarActionWrap>
            <button
              ref={filterButtonRef}
              type="button"
              className={`payroll-filter-trigger${
                filtersActive ? ' payroll-filter-trigger--active' : ''
              }`}
              onClick={toggleFilter}
              aria-expanded={filterOpen}
              aria-label={`Фильтр · ${periodLabel}`}
              title={`Фильтр · ${periodLabel}`}
            >
              <FilterIcon size={18} />
              <span className="payroll-filter-trigger__label">
                Фильтр · {periodLabel}
              </span>
              <span className="payroll-filter-trigger__label payroll-filter-trigger__label--short">
                {periodLabel}
              </span>
              {filtersActive ? (
                <span className="payroll-filter-trigger__dot" aria-hidden="true" />
              ) : null}
            </button>
            <PayrollFilterPopover
              open={filterOpen}
              draftYear={draftYear}
              draftMonth={draftMonth}
              onMonthChange={(nextYear, nextMonth) => {
                setDraftYear(nextYear)
                setDraftMonth(nextMonth)
              }}
              draftRoleId={draftRoleId}
              draftShowExcluded={draftShowExcluded}
              onRoleChange={setDraftRoleId}
              onShowExcludedChange={setDraftShowExcluded}
              resultCount={draftPreviewCount}
              onApply={applyFilters}
              onReset={resetFilters}
              onClose={() => setFilterOpen(false)}
              anchorRef={filterButtonRef}
            />
          </PlatformToolbarActionWrap>
        }
      />

      {error && <p className="payroll-section__error">{error}</p>}

      {loading ? (
        <DelayedLoadingSkeleton variant="table" count={5} />
      ) : error ? null : rows.length === 0 ? (
        <p className="payroll-section__empty">
          {search || filtersActive
            ? 'Сотрудники не найдены по текущим фильтрам'
            : 'Нет активных сотрудников для расчёта'}
        </p>
      ) : (
        <div className="payroll-table-wrap">
            <table className="payroll-table">
              <thead>
                <tr>
                  <th className="payroll-table__num">№</th>
                  <th className="payroll-table__employee">Сотрудник</th>
                  <th
                    className="payroll-table__money"
                    title="Ставка: месячный оклад или стоимость смены — по типу расчёта сотрудника"
                  >
                    Ставка
                  </th>
                  <th className="payroll-table__money">Начисления</th>
                  <th className="payroll-table__money">Удержания</th>
                  <th className="payroll-table__money">К выдаче</th>
                  <th className="payroll-table__money">Аванс</th>
                  <th className="payroll-table__money">Остаток</th>
                  <th className="payroll-table__money">Выплачено</th>
                  <th className="payroll-table__comment">Ком.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ employee, record, amounts }, index) => {
                  const positionDisplay = getEmployeePositionDisplay(employee)
                  const notesPresent = hasRecordNotes(record)
                  const rowSaving = savingEmployeeId === employee.id
                  const profilePath = getPayrollEmployeeLink(employee)
                  const personBlock = (
                    <span className="payroll-table__person">
                      <span className="payroll-table__name">{employee.name}</span>
                      <span className="payroll-table__role">{positionDisplay}</span>
                    </span>
                  )
                  return (
                    <tr key={employee.id}>
                      <td className="payroll-table__num">{index + 1}</td>
                      <td className="payroll-table__employee">
                        {profilePath ? (
                          <Link
                            to={profilePath}
                            className="payroll-table__person-link"
                            onClick={() => persistPayrollUiState()}
                          >
                            {personBlock}
                          </Link>
                        ) : (
                          personBlock
                        )}
                      </td>
                      <PayrollInlineMoneyCell
                        value={amounts.baseColumnValue}
                        hint={amounts.baseColumnLabel}
                        detail={amounts.baseColumnDetail || ''}
                        detailTitle={
                          amounts.baseColumnDetail
                            ? 'План — рабочие смены по графику за выбранный месяц.'
                            : ''
                        }
                        ariaLabel={
                          amounts.baseColumnMode === SALARY_CALCULATION_TYPE.SHIFT_BASED
                            ? 'Редактировать ставку (за смену)'
                            : 'Редактировать ставку (оклад)'
                        }
                        saving={rowSaving}
                        onCommit={(next) => handleSaveBaseColumn(employee, next)}
                      />
                      <td className="payroll-table__money">
                        <button
                          type="button"
                          className="payroll-table__money-btn payroll-table__money-btn--link"
                          onClick={() => void handleOpenLines(employee, 'allowances')}
                        >
                          {formatMoneyCompact(amounts.allowances)}
                        </button>
                      </td>
                      <td className="payroll-table__money">
                        <button
                          type="button"
                          className="payroll-table__money-btn payroll-table__money-btn--link"
                          onClick={() => void handleOpenLines(employee, 'deductions')}
                        >
                          {formatMoneyCompact(amounts.deductions)}
                        </button>
                      </td>
                      <td className="payroll-table__money payroll-table__money--readonly">
                        <div className="payroll-table__money-stack">
                          <span className="payroll-table__money-value">
                            {formatMoneyCompact(amounts.payable)}
                          </span>
                          {amounts.payableDetail ? (
                            <span
                              className="payroll-table__money-detail"
                              title="Отработано — фактически завершённые смены по тайм-трекеру."
                            >
                              {amounts.payableDetail}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <PayrollInlineMoneyCell
                        value={amounts.advance}
                        saving={rowSaving}
                        onCommit={(next) => handleSaveAdvance(employee, next)}
                      />
                      <td className="payroll-table__money payroll-table__money--readonly">
                        {formatMoneyCompact(amounts.remainder)}
                      </td>
                      <PayrollInlineMoneyCell
                        value={amounts.paid}
                        saving={rowSaving}
                        onCommit={(next) => handleSavePaid(employee, next)}
                      />
                      <td className="payroll-table__comment">
                        <button
                          type="button"
                          className={`payroll-table__comment-btn${
                            notesPresent ? ' payroll-table__comment-btn--filled' : ''
                          }`}
                          onClick={() => void handleOpenComment(employee, record)}
                          aria-label={
                            notesPresent ? 'Открыть комментарий' : 'Добавить комментарий'
                          }
                          title={notesPresent ? 'Есть комментарий' : 'Комментарий'}
                        >
                          <CommentIcon size={15} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="payroll-table__totals">
                  <td className="payroll-table__num" />
                  <td className="payroll-table__totals-label">{totalsLabel}</td>
                  <TotalsMoney value={totals.baseSalary} />
                  <TotalsMoney value={totals.allowances} />
                  <TotalsMoney value={totals.deductions} />
                  <TotalsMoney value={totals.payable} />
                  <TotalsMoney value={totals.advance} />
                  <TotalsMoney value={totals.remainder} />
                  <TotalsMoney value={totals.paid} />
                  <td className="payroll-table__comment" />
                </tr>
              </tfoot>
            </table>
          </div>
      )}

      {commentTarget && (
        <PayrollCommentModal
          employeeName={commentTarget.employee.name}
          initialNotes={commentTarget.record?.notes || ''}
          initialParticipation={commentTarget.employee.payrollParticipation}
          saving={commentSaving}
          excluding={commentExcluding}
          onClose={() => {
            if (!commentSaving && !commentExcluding) setCommentTarget(null)
          }}
          onSave={(payload) => void handleSaveComment(payload)}
          onExclude={() => void handleExcludeFromPayroll()}
        />
      )}

      {linesTarget && (
        <PayrollLinesModal
          title={linesTarget.mode === 'allowances' ? 'Начисления' : 'Удержания'}
          employeeName={linesTarget.employee.name}
          presets={
            linesTarget.mode === 'allowances' ? SALARY_ALLOWANCE_PRESETS : DEDUCTION_PRESETS
          }
          lines={linesTarget.lines}
          onClose={() => setLinesTarget(null)}
          onAdd={async (payload) => {
            const recordId = linesTarget.record.id
            const created =
              linesTarget.mode === 'allowances'
                ? await addSalaryAllowance(recordId, payload)
                : await addSalaryDeduction(recordId, payload)
            await refreshLinesTarget(recordId, linesTarget.employee, linesTarget.mode)
            return created
          }}
          onUpdate={async (lineId, patch) => {
            const recordId = linesTarget.record.id
            const updated =
              linesTarget.mode === 'allowances'
                ? await updateSalaryAllowance(lineId, recordId, patch)
                : await updateSalaryDeduction(lineId, recordId, patch)
            await refreshLinesTarget(recordId, linesTarget.employee, linesTarget.mode)
            return updated
          }}
          onRemove={async (lineId) => {
            const recordId = linesTarget.record.id
            if (linesTarget.mode === 'allowances') {
              await deleteSalaryAllowance(lineId, recordId)
            } else {
              await deleteSalaryDeduction(lineId, recordId)
            }
            await refreshLinesTarget(recordId, linesTarget.employee, linesTarget.mode)
          }}
        />
      )}
    </div>
  )
}
