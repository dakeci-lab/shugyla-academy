import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePlatformPageTitle } from '../../../context/PlatformPageTitleContext'
import { getEmployeeById } from '../../../utils/employeeData'
import { getRoleLabel } from '../../../data/roles'
import { getRoleByCode, getRolesForEmployeeForm } from '../../../services/rbacService'
import { formatRoleDisplayLabel } from '../../../utils/roleDisplay'
import { isCloudMode } from '../../../lib/dataMode'
import {
  EmployeeAdminError,
  getEmployeeForAdmin,
} from '../../../services/employeeAdminService'
import { fetchEmployeeWorkforceBundle } from '../../../services/workforceAdminService'
import { getAttendanceSettings } from '../../../services/academyDataService'
import {
  calculateEmployeeRatingFromShifts,
  RATING_STATUS,
} from '../../../utils/attendanceData'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import {
  canEditEmployees,
  canManageEmployees,
  canViewEmployeeRating,
  canViewTeamSchedule,
  PERMISSION_CODES,
} from '../../../config/permissions'
import Can from '../../auth/Can'
import EmployeeProfileHeader from '../employees/EmployeeProfileHeader'
import EmployeePeriodSummary from '../employees/EmployeePeriodSummary'
import EmployeeEditModal from '../employees/EmployeeEditModal'
import EmployeeScheduleSection from './EmployeeScheduleSection'
import ConfirmDialog from '../ConfirmDialog'
import {
  deactivateEmployee,
  restoreEmployee,
} from '../../../services/academyDataService'
import {
  isActiveStaffEmployee,
  isDeactivatedStaffEmployee,
} from '../../../utils/employeeData'
import './EmployeeProfileSection.css'

function getInitialMonth(weekStartKey) {
  if (weekStartKey && /^\d{4}-\d{2}-\d{2}$/.test(weekStartKey)) {
    const [y, m] = weekStartKey.split('-').map(Number)
    return { year: y, month: m }
  }
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

/** Единая карточка сотрудника: профиль + статистика + персональный график */
export default function EmployeeProfileSection({ employeeId }) {
  const cloudMode = isCloudMode()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useSession()
  const { success: showSuccess, error: showError } = useToast()
  const { version, refresh } = useAdminRefresh()
  const weekStartKey = searchParams.get('week')
  const mountedRef = useRef(true)

  const [employee, setEmployee] = useState(null)
  const [employeeLoading, setEmployeeLoading] = useState(true)
  const [employeeMissing, setEmployeeMissing] = useState(false)
  const [employeeError, setEmployeeError] = useState('')
  const [roleLabel, setRoleLabel] = useState('')
  const [showLogin, setShowLogin] = useState(false)

  const [period, setPeriod] = useState(() => getInitialMonth(weekStartKey))
  const [periodShifts, setPeriodShifts] = useState([])
  const [scheduleLoading, setScheduleLoading] = useState(true)
  const [scheduleError, setScheduleError] = useState('')

  const [rating, setRating] = useState(null)
  const [ratingLoading, setRatingLoading] = useState(false)
  const showRating = canViewEmployeeRating(user)

  const [showEdit, setShowEdit] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState(null)
  const [activateTarget, setActivateTarget] = useState(null)
  const [deactivating, setDeactivating] = useState(false)
  const [activating, setActivating] = useState(false)

  const canEdit = canEditEmployees(user)
  const canSeeAdminFields = canManageEmployees(user)
  const backPath = canManageEmployees(user)
    ? '/platform/employees/list'
    : canViewTeamSchedule(user)
      ? '/platform/employees/schedule'
      : '/platform'

  usePlatformPageTitle('Карточка сотрудника', '', {
    showBack: true,
    backFallback: backPath,
  })

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (window.location.hash !== '#schedule') return undefined
    const timer = window.setTimeout(() => {
      document.getElementById('schedule')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [employeeId, employeeLoading])

  const loadEmployee = useCallback(async () => {
    if (!employeeId) return
    setEmployeeLoading(true)
    setEmployeeError('')
    setEmployeeMissing(false)

    try {
      let nextEmployee = null
      let nextShowLogin = false

      if (cloudMode) {
        if (canSeeAdminFields) {
          try {
            // Primary admin path: exact employee_id lookup (no full list load).
            nextEmployee = await getEmployeeForAdmin(employeeId, {
              allowSearchFallback: false,
            })
            nextShowLogin = true
          } catch (err) {
            if (err instanceof EmployeeAdminError && err.code === 'employee_not_found') {
              throw err
            }
            if (
              err instanceof EmployeeAdminError &&
              (err.code === 'unauthorized' ||
                err.code === 'forbidden' ||
                err.code === 'inactive_caller')
            ) {
              throw err
            }

            // Temporary compatibility: older Edge builds reject employee_id.
            // Resolve a name hint via workforce, then run a single search fallback.
            const now = new Date()
            const bundle = await fetchEmployeeWorkforceBundle(
              employeeId,
              now.getFullYear(),
              now.getMonth() + 1,
              'schedule'
            )
            if (!bundle.employee) {
              throw new EmployeeAdminError('Сотрудник не найден', 'employee_not_found')
            }
            nextEmployee = await getEmployeeForAdmin(employeeId, {
              searchHint: bundle.employee.name || '',
              allowSearchFallback: true,
            })
            nextShowLogin = true
          }
        } else {
          // Schedule viewers without employees.view use workforce identity only.
          const now = new Date()
          const bundle = await fetchEmployeeWorkforceBundle(
            employeeId,
            now.getFullYear(),
            now.getMonth() + 1,
            'schedule'
          )
          nextEmployee = bundle.employee
          nextShowLogin = false
        }
      } else {
        nextEmployee = getEmployeeById(Number(employeeId))
        nextShowLogin = canSeeAdminFields
      }

      if (!mountedRef.current) return

      if (!nextEmployee) {
        setEmployee(null)
        setEmployeeMissing(true)
        setShowLogin(false)
        return
      }

      setEmployee(nextEmployee)
      setShowLogin(nextShowLogin)

      try {
        const roles = await getRolesForEmployeeForm(
          nextEmployee.role,
          nextEmployee.roleId
        )
        const role =
          roles.find((item) => item.id === nextEmployee.roleId) ||
          getRoleByCode(nextEmployee.role)
        if (mountedRef.current) {
          setRoleLabel(
            role
              ? formatRoleDisplayLabel(role, roles)
              : nextEmployee.position || getRoleLabel(nextEmployee.role)
          )
        }
      } catch {
        if (mountedRef.current) {
          setRoleLabel(nextEmployee.position || getRoleLabel(nextEmployee.role))
        }
      }
    } catch (err) {
      if (!mountedRef.current) return

      if (err instanceof EmployeeAdminError && err.code === 'employee_not_found') {
        setEmployee(null)
        setEmployeeMissing(true)
        setShowLogin(false)
        setEmployeeError('')
        return
      }

      const message = err.message || 'Не удалось загрузить сотрудника'
      setEmployeeError(message)
      setEmployee(null)
      showError(message)
    } finally {
      if (mountedRef.current) setEmployeeLoading(false)
    }
  }, [employeeId, cloudMode, canSeeAdminFields, showError])

  useEffect(() => {
    loadEmployee()
    // Intentionally omit AcademyData `version`: progressive bootstrap was replaying
    // admin-list-employees / workforce. Mutations call loadEmployee + refresh.
  }, [loadEmployee])

  useEffect(() => {
    if (!showRating || scheduleLoading) {
      if (!showRating) {
        setRating(null)
        setRatingLoading(false)
      }
      return undefined
    }

    let cancelled = false
    setRatingLoading(true)

    ;(async () => {
      try {
        const settings = await getAttendanceSettings()
        const result = calculateEmployeeRatingFromShifts(periodShifts, settings)
        if (cancelled || !mountedRef.current) return

        if (
          !result ||
          result.ratingStatus === RATING_STATUS.NO_SCHEDULE ||
          result.ratingStatus === RATING_STATUS.NO_COMPLETED
        ) {
          setRating(null)
        } else {
          setRating(result.score ?? null)
        }
      } catch {
        if (!cancelled && mountedRef.current) {
          setRating(null)
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setRatingLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [showRating, scheduleLoading, periodShifts])

  const handleSchedulePeriodChange = useCallback(({ year, month, shifts, loading, error }) => {
    setPeriod({ year, month })
    setPeriodShifts(shifts || [])
    setScheduleLoading(Boolean(loading))
    setScheduleError(error || '')
  }, [])

  const handleScheduleEmployeeSync = useCallback((nextEmployee) => {
    if (!nextEmployee) return
    setEmployee((current) => {
      if (!current) return nextEmployee
      return {
        ...current,
        ...nextEmployee,
        login: current.login ?? nextEmployee.login,
      }
    })
  }, [])

  async function handleEmployeeSaved() {
    await loadEmployee()
    refresh()
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return
    setDeactivating(true)
    try {
      await deactivateEmployee(deactivateTarget.id)
      setDeactivateTarget(null)
      setShowEdit(false)
      showSuccess('Сотрудник деактивирован')
      await handleEmployeeSaved()
    } catch (err) {
      showError(err.message || 'Не удалось деактивировать сотрудника')
    } finally {
      setDeactivating(false)
    }
  }

  async function confirmActivate() {
    if (!activateTarget) return
    setActivating(true)
    try {
      await restoreEmployee(activateTarget.id)
      setActivateTarget(null)
      setShowEdit(false)
      showSuccess('Сотрудник активирован')
      await handleEmployeeSaved()
    } catch (err) {
      showError(err.message || 'Не удалось активировать сотрудника')
    } finally {
      setActivating(false)
    }
  }

  if (employeeLoading && !employee) {
    return (
      <div className="employee-profile-section">
        <div className="employee-profile-section__loading" role="status">
          Загрузка карточки сотрудника…
        </div>
      </div>
    )
  }

  if (employeeMissing || (!employee && !employeeLoading)) {
    return (
      <div className="employee-profile-section">
        <div className="employee-profile-section__empty" role="status">
          <h1>Сотрудник не найден</h1>
          <p>Сотрудник удалён или недоступен для просмотра.</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => navigate(backPath)}
          >
            {canManageEmployees(user) ? 'К списку сотрудников' : 'Назад'}
          </button>
        </div>
      </div>
    )
  }

  if (employeeError && !employee) {
    return (
      <div className="employee-profile-section">
        <div className="employee-profile-section__empty" role="alert">
          <h1>Не удалось загрузить</h1>
          <p>{employeeError}</p>
          <button type="button" className="btn btn--primary" onClick={loadEmployee}>
            Повторить
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="employee-profile-section">
      <EmployeeProfileHeader
        employee={employee}
        roleLabel={roleLabel}
        showLogin={showLogin}
        canEdit={canEdit}
        onEdit={() => setShowEdit(true)}
      />

      <EmployeePeriodSummary
        year={period.year}
        month={period.month}
        shifts={periodShifts}
        loading={scheduleLoading}
        rating={rating}
        ratingLoading={ratingLoading}
        showRating={showRating}
      />

      {scheduleError && (
        <p className="admin-form__error employee-profile-section__schedule-error">
          {scheduleError}
        </p>
      )}

      <section
        id="schedule"
        className="employee-profile-section__schedule"
        aria-label="Персональный график"
      >
        <EmployeeScheduleSection
          employeeId={employeeId}
          weekStartKey={weekStartKey}
          embedded
          sharedEmployee={employee}
          onPeriodChange={handleSchedulePeriodChange}
          onEmployeeSync={handleScheduleEmployeeSync}
        />
      </section>

      {showEdit && employee && (
        <Can permission={PERMISSION_CODES.EMPLOYEES_EDIT}>
          <EmployeeEditModal
            employee={employee}
            onClose={() => setShowEdit(false)}
            onSaved={handleEmployeeSaved}
            onRequestDeactivate={
              isActiveStaffEmployee(employee) ? setDeactivateTarget : undefined
            }
            onRequestActivate={
              isDeactivatedStaffEmployee(employee) ? setActivateTarget : undefined
            }
            deactivating={deactivating}
            activating={activating}
          />
        </Can>
      )}

      {deactivateTarget && (
        <ConfirmDialog
          title="Деактивировать сотрудника?"
          message={`Сотрудник «${deactivateTarget.name}» потеряет доступ к работе в платформе согласно текущей логике. Исторические данные, график, рейтинг, посещаемость и обучение сохранятся.`}
          confirmLabel="Деактивировать"
          onCancel={() => setDeactivateTarget(null)}
          onConfirm={confirmDeactivate}
          loading={deactivating}
        />
      )}

      {activateTarget && (
        <ConfirmDialog
          title="Активировать сотрудника?"
          message={`Вернуть сотрудника «${activateTarget.name}» в активный статус? Прежние данные сохранятся.`}
          confirmLabel="Активировать"
          confirmVariant="primary"
          onCancel={() => setActivateTarget(null)}
          onConfirm={confirmActivate}
          loading={activating}
        />
      )}
    </div>
  )
}
