import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  EMPTY_EMPLOYEE_FORM,
  employeeToForm,
  validateEmployeeForm,
  buildEmployeeCloudUpdateChanges,
  EMPLOYEE_STATUS_OPTIONS,
  WORK_MODE_OPTIONS,
  SALARY_CALCULATION_TYPE_OPTIONS,
  PAYROLL_PARTICIPATION_OPTIONS,
  getStaffEmployees,
  isActiveStaffEmployee,
  isDeactivatedStaffEmployee,
} from '../../../utils/employeeData'
import {
  createEmployee,
  updateEmployee,
  linkCandidateToEmployee,
  getWorkLocations,
} from '../../../services/platformDataService'
import { getRoleLabel } from '../../../data/roles'
import { getRoleByCode, getRolesForEmployeeForm } from '../../../services/rbacService'
import {
  buildPositionSelectGroups,
  ensurePositionCatalogLoaded,
  getPositionById,
  isPositionAssignable,
  reloadPositionCatalog,
} from '../../../services/positionCatalogService'
import { formatRoleDisplayLabel } from '../../../utils/roleDisplay'
import { isCloudMode } from '../../../lib/dataMode'
import {
  MIN_EMPLOYEE_TEMP_PASSWORD_LENGTH,
  validateEmployeeTemporaryPassword,
} from '../../../utils/employeePasswordValidation'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import Can from '../../auth/Can'
import { can, PERMISSION_CODES } from '../../../config/permissions'
import AdminModal from '../AdminModal'
import ConfirmDialog from '../ConfirmDialog'
import EmployeeAvatar from '../../EmployeeAvatar'
import ProfileAvatarEditor from '../../ProfileAvatarEditor'
import '../RecruitmentSection.css'
import './EmployeeEditModal.css'

const POSITION_INACTIVE_RE =
  /должность недоступна|position_inactive|position_group_inactive|position_not_found|invalid_position/i

/**
 * Shared create/edit employee modal used by the list and employee profile.
 * Position (job title) and system role (access) are independent fields.
 */
export default function EmployeeEditModal({
  employee = null,
  initialForm = null,
  sourceCandidateId = null,
  candidatePhone = '',
  onClose,
  onSaved,
  onFormDirty,
  onRequestDeactivate,
  onRequestActivate,
  deactivating = false,
  activating = false,
}) {
  const cloudMode = isCloudMode()
  const { user: sessionUser } = useSession()
  const { success: showSuccess, error: showError } = useToast()
  const editId = employee?.id ?? null
  const [form, setForm] = useState(() =>
    employee ? employeeToForm(employee) : { ...EMPTY_EMPLOYEE_FORM, ...(initialForm || {}) }
  )
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [workLocations, setWorkLocations] = useState([])
  const [assignableRoles, setAssignableRoles] = useState([])
  const [avatarRevision, setAvatarRevision] = useState(0)
  const [positionGroups, setPositionGroups] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(Boolean(cloudMode))
  const [catalogError, setCatalogError] = useState('')
  const [roleConfirmOpen, setRoleConfirmOpen] = useState(false)
  const [pendingSaveEvent, setPendingSaveEvent] = useState(null)

  useEffect(() => {
    setForm(
      employee
        ? employeeToForm(employee)
        : { ...EMPTY_EMPLOYEE_FORM, ...(initialForm || {}) }
    )
    setFormError('')
    setAvatarRevision(0)
    setRoleConfirmOpen(false)
    setPendingSaveEvent(null)
  }, [employee, initialForm, sourceCandidateId])

  useEffect(() => {
    getRolesForEmployeeForm(form.role, form.roleId)
      .then((roles) => {
        setAssignableRoles(roles)
        // Resolve default role code → roleId once roles are available (create flow).
        if (!form.roleId && form.role) {
          const matched = roles.find((role) => role.code === form.role && role.isActive !== false)
          if (matched?.id) {
            setForm((current) =>
              current.roleId ? current : { ...current, roleId: matched.id, role: matched.code }
            )
          }
        }
      })
      .catch(() => setAssignableRoles([]))
  }, [form.role, form.roleId])

  useEffect(() => {
    getWorkLocations()
      .then(setWorkLocations)
      .catch(() => setWorkLocations([]))
  }, [])

  const editingSelf = useMemo(
    () => Boolean(editId && sessionUser?.id != null && Number(sessionUser.id) === Number(editId)),
    [editId, sessionUser?.id]
  )

  const canEditPosition =
    !editingSelf &&
    (editId
      ? can(sessionUser, PERMISSION_CODES.EMPLOYEES_EDIT)
      : can(sessionUser, PERMISSION_CODES.EMPLOYEES_CREATE) ||
        can(sessionUser, PERMISSION_CODES.EMPLOYEES_EDIT))

  const canEditRole =
    !editingSelf &&
    (editId
      ? can(sessionUser, PERMISSION_CODES.EMPLOYEES_MANAGE_ROLES)
      : can(sessionUser, PERMISSION_CODES.EMPLOYEES_CREATE) ||
        can(sessionUser, PERMISSION_CODES.EMPLOYEES_MANAGE_ROLES))

  const canViewPositions = can(sessionUser, PERMISSION_CODES.POSITIONS_VIEW)
  const canManagePositions = can(sessionUser, PERMISSION_CODES.POSITIONS_MANAGE)

  const loadCatalog = async ({ force = false } = {}) => {
    if (!cloudMode) {
      setCatalogLoading(false)
      setCatalogError('')
      setPositionGroups([])
      return
    }
    setCatalogLoading(true)
    setCatalogError('')
    try {
      if (force) await reloadPositionCatalog()
      else await ensurePositionCatalogLoaded()
      const currentId = form.positionId || employee?.positionId || null
      setPositionGroups(
        buildPositionSelectGroups({
          currentPositionId: currentId,
          includeArchivedCurrent: Boolean(editId),
        })
      )
    } catch (err) {
      setCatalogError(err?.message || 'Не удалось загрузить справочник должностей')
    } finally {
      setCatalogLoading(false)
    }
  }

  useEffect(() => {
    loadCatalog()
    // Re-group when current position changes so archived current stays visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional catalog refresh on open/position
  }, [cloudMode, editId, form.positionId, employee?.positionId])

  const selectedPosition = useMemo(() => {
    if (!form.positionId) return null
    return getPositionById(form.positionId)
  }, [form.positionId, positionGroups])

  const selectedPositionArchived = Boolean(
    selectedPosition &&
      (selectedPosition.isActive === false || selectedPosition.groupIsActive === false)
  )

  const showDeactivateAction =
    editId &&
    employee &&
    isActiveStaffEmployee(employee) &&
    !editingSelf &&
    typeof onRequestDeactivate === 'function'

  const showActivateAction =
    editId &&
    employee &&
    isDeactivatedStaffEmployee(employee) &&
    !editingSelf &&
    typeof onRequestActivate === 'function'

  function patchForm(patch) {
    onFormDirty?.()
    setForm((current) => ({ ...current, ...patch }))
  }

  function resolveSelectedRole() {
    return (
      assignableRoles.find((role) => role.id === form.roleId) ||
      getRoleByCode(form.role) ||
      assignableRoles.find((role) => role.code === form.role)
    )
  }

  function roleChanged() {
    if (!editId || editingSelf || !canEditRole) return false
    const selectedRole = resolveSelectedRole()
    const nextRoleId = selectedRole?.id || form.roleId || null
    return Boolean(nextRoleId && String(nextRoleId) !== String(employee?.roleId || ''))
  }

  async function performSave() {
    if (submitting || deactivating || activating) return

    if (!editId && cloudMode) {
      const passwordError = validateEmployeeTemporaryPassword(form.password)
      if (passwordError) {
        setFormError(passwordError)
        return
      }
    }

    const requirePositionId = cloudMode && (canEditPosition || !editId)
    const error = validateEmployeeForm(form, editId, { requirePositionId })
    if (error) {
      setFormError(error)
      return
    }

    const selectedRole = resolveSelectedRole()
    const roleCode = selectedRole?.code || form.role

    if (!editId && cloudMode && (!selectedRole?.id || selectedRole.isActive === false)) {
      setFormError('Выбранная роль недоступна')
      return
    }

    if (cloudMode && canEditPosition && form.positionId) {
      if (!editId || String(form.positionId) !== String(employee?.positionId || '')) {
        if (!isPositionAssignable(form.positionId)) {
          setFormError('Выбранная должность недоступна. Выберите активную должность.')
          return
        }
      }
    }

    if (catalogError && canEditPosition && form.positionId &&
      String(form.positionId) !== String(employee?.positionId || '')) {
      setFormError('Справочник должностей недоступен. Повторите загрузку перед сменой должности.')
      return
    }

    setSubmitting(true)
    setFormError('')
    try {
      if (editId) {
        if (cloudMode) {
          const changes = buildEmployeeCloudUpdateChanges(employee, form, {
            selectedRole: canEditRole ? selectedRole : null,
            editingSelf,
          })
          if (!canEditRole && changes.roleId) delete changes.roleId
          if (!canEditPosition && changes.positionId) delete changes.positionId
          if (Object.keys(changes).length === 0) {
            showSuccess('Изменений нет')
            onClose?.()
            return
          }
          await updateEmployee(editId, changes)
        } else {
          await updateEmployee(editId, {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            ...(canEditRole
              ? {
                  role: roleCode,
                  roleId: selectedRole?.id || form.roleId || null,
                }
              : {}),
            ...(canEditPosition && form.positionId
              ? { positionId: form.positionId }
              : {}),
            login: form.login.trim(),
            employmentStatus: form.employmentStatus,
            hiredAt: form.hiredAt,
            workMode: form.workMode,
            salaryCalculationType: form.salaryCalculationType,
            payrollParticipation: form.payrollParticipation,
            workLocationId: form.workLocationId || null,
            ...(form.avatarUrl ? { avatarUrl: form.avatarUrl } : {}),
            ...(form.password?.trim() ? { password: form.password } : {}),
          })
        }
        await onSaved?.({ id: editId, mode: 'update' })
        showSuccess('Сотрудник сохранён')
        onClose?.()
      } else {
        const payload = {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          role: roleCode,
          roleId: selectedRole?.id || form.roleId || null,
          positionId: form.positionId || null,
          login: form.login.trim(),
          employmentStatus: form.employmentStatus,
          workMode: form.workMode,
          salaryCalculationType: form.salaryCalculationType,
          payrollParticipation: form.payrollParticipation,
          workLocationId: form.workLocationId || null,
          sourceCandidateId: sourceCandidateId || undefined,
          ...(form.avatarUrl ? { avatarUrl: form.avatarUrl } : {}),
          ...(form.password?.trim() ? { password: form.password } : {}),
        }
        const newUserId = await createEmployee(payload)
        if (sourceCandidateId) {
          await linkCandidateToEmployee(sourceCandidateId, newUserId)
        }
        await onSaved?.({ id: newUserId, mode: 'create' })
        showSuccess('Сотрудник успешно создан')
        onClose?.()
      }
    } catch (err) {
      const message = err.message || 'Не удалось сохранить сотрудника'
      setFormError(message)
      showError(message)
      if (POSITION_INACTIVE_RE.test(message) || POSITION_INACTIVE_RE.test(String(err?.code || ''))) {
        await loadCatalog({ force: true })
      }
    } finally {
      setSubmitting(false)
      setRoleConfirmOpen(false)
      setPendingSaveEvent(null)
    }
  }

  async function handleSave(event) {
    event.preventDefault()
    if (submitting || deactivating || activating) return

    if (roleChanged()) {
      setPendingSaveEvent(event)
      setRoleConfirmOpen(true)
      return
    }
    await performSave()
  }

  const saveLabel = submitting
    ? 'Сохранение…'
    : sourceCandidateId
      ? 'Создать сотрудника'
      : 'Сохранить'

  const currentRoleLabel = formatRoleDisplayLabel(
    getRoleByCode(employee?.role) || {
      code: employee?.role,
      name: getRoleLabel(employee?.role),
      employeeCount: 0,
    },
    assignableRoles
  )
  const nextRole = resolveSelectedRole()
  const nextRoleLabel = nextRole
    ? formatRoleDisplayLabel(nextRole, assignableRoles)
    : getRoleLabel(form.role)

  const legacyUnlinked =
    editId && !form.positionId && Boolean(employee?.position)

  const positionSelectDisabled =
    submitting || !canEditPosition || catalogLoading || Boolean(catalogError && !form.positionId)

  return (
    <>
      <AdminModal
        title={editId ? 'Редактировать сотрудника' : 'Добавить сотрудника'}
        onClose={submitting ? () => {} : onClose}
        wide
        footer={
          <div className="employees-modal-footer">
            {showDeactivateAction && (
              <Can permission={PERMISSION_CODES.EMPLOYEES_DEACTIVATE}>
                <button
                  type="button"
                  className="btn employees-modal-footer__status-action employees-modal-footer__status-action--danger"
                  disabled={submitting || deactivating || activating}
                  onClick={() => onRequestDeactivate(employee)}
                >
                  Уволить сотрудника
                </button>
              </Can>
            )}
            {showActivateAction && (
              <Can permission={PERMISSION_CODES.EMPLOYEES_EDIT}>
                <button
                  type="button"
                  className="btn employees-modal-footer__status-action employees-modal-footer__status-action--success"
                  disabled={submitting || deactivating || activating}
                  onClick={() => onRequestActivate(employee)}
                >
                  Восстановить сотрудника
                </button>
              </Can>
            )}
            <div className="employees-modal-footer__actions">
              <button
                type="button"
                className="btn btn--outline"
                onClick={onClose}
                disabled={submitting}
              >
                Отмена
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                form="employee-form"
                disabled={submitting || deactivating || activating}
                aria-busy={submitting}
              >
                {saveLabel}
              </button>
            </div>
          </div>
        }
      >
        <form id="employee-form" className="admin-form" onSubmit={handleSave}>
          {sourceCandidateId && (
            <div className="employee-form-candidate-meta">
              {form.avatarUrl && (
                <EmployeeAvatar
                  name={`${form.firstName} ${form.lastName}`.trim()}
                  avatarUrl={form.avatarUrl}
                  size="lg"
                />
              )}
              <div className="employee-form-candidate-meta__info">
                <p className="admin-form__hint">
                  Данные заполнены из карточки кандидата. Логин, пароль, должность и роль укажите
                  вручную.
                </p>
                {candidatePhone && (
                  <p>
                    <strong>Телефон:</strong> {candidatePhone}
                  </p>
                )}
              </div>
            </div>
          )}

          {editId && !cloudMode && (
            <ProfileAvatarEditor
              key={`${editId}-${avatarRevision}`}
              employeeId={editId}
              employee={{
                ...form,
                name: `${form.firstName} ${form.lastName}`.trim(),
                avatarUrl:
                  getStaffEmployees('all').find((item) => item.id === editId)?.avatarUrl ||
                  form.avatarUrl,
              }}
              onAvatarChange={async () => {
                setAvatarRevision((value) => value + 1)
                await onSaved?.({ id: editId, mode: 'avatar' })
              }}
            />
          )}

          <div className="admin-form__row">
            <label className="admin-form__label">
              Имя *
              <input
                className="admin-form__input"
                value={form.firstName}
                onChange={(e) => patchForm({ firstName: e.target.value })}
                required
                disabled={submitting}
              />
            </label>
            <label className="admin-form__label">
              Фамилия
              <input
                className="admin-form__input"
                value={form.lastName}
                onChange={(e) => patchForm({ lastName: e.target.value })}
                disabled={submitting}
              />
            </label>
          </div>

          <fieldset className="employee-form-section" disabled={submitting}>
            <legend className="employee-form-section__legend">Работа и доступ</legend>
            <p className="employee-form-section__note" id="employee-position-role-note">
              Должность определяет работу сотрудника, а роль — его доступы в платформе.
            </p>

            <label className="admin-form__label" htmlFor="employee-position-select">
              Должность {!editId ? '*' : ''}
              {catalogLoading ? (
                <span className="admin-form__hint" role="status">
                  Загрузка справочника должностей…
                </span>
              ) : null}
              {catalogError ? (
                <div className="employee-form-catalog-error" role="alert">
                  <p className="admin-form__error">{catalogError}</p>
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={() => loadCatalog({ force: true })}
                  >
                    Повторить
                  </button>
                </div>
              ) : null}
              <select
                id="employee-position-select"
                className="admin-form__select"
                value={form.positionId || ''}
                disabled={positionSelectDisabled}
                aria-describedby="employee-position-role-note employee-position-hint"
                onChange={(e) => patchForm({ positionId: e.target.value })}
              >
                <option value="">
                  {legacyUnlinked ? 'Выберите должность из справочника' : 'Выберите должность'}
                </option>
                {positionGroups.map((group) => (
                  <optgroup
                    key={group.groupId || group.groupName}
                    label={
                      group.groupIsActive === false
                        ? `${group.groupName} (архивная группа)`
                        : group.groupName
                    }
                  >
                    {group.positions.map((position) => {
                      const archived =
                        position.isActive === false ||
                        position.groupIsActive === false ||
                        position.__isCurrentArchived
                      return (
                        <option key={position.id} value={position.id}>
                          {position.name}
                          {archived ? ' (архивная)' : ''}
                        </option>
                      )
                    })}
                  </optgroup>
                ))}
              </select>
              <span className="admin-form__hint" id="employee-position-hint">
                {editingSelf
                  ? 'Собственную должность нельзя изменить.'
                  : !canEditPosition
                    ? 'Недостаточно прав для изменения должности.'
                    : selectedPosition
                      ? `Группа: ${selectedPosition.groupName || '—'}${
                          selectedPositionArchived ? ' · Архивная структура' : ''
                        }`
                      : legacyUnlinked
                        ? `Должность не привязана к справочнику · ${employee.position}`
                        : 'Выберите должность из справочника организационной структуры.'}
              </span>
              {canViewPositions && (
                <span className="admin-form__hint employee-form-position-link">
                  <Link to="/platform/settings/roles?tab=positions">
                    {canManagePositions
                      ? 'Создать должность в настройках'
                      : 'Управление должностями'}
                  </Link>
                </span>
              )}
            </label>

            <label className="admin-form__label" htmlFor="employee-role-select">
              Роль в системе *
              <select
                id="employee-role-select"
                className="admin-form__select"
                value={form.roleId || form.role}
                disabled={editingSelf || !canEditRole || submitting}
                aria-describedby="employee-role-hint"
                onChange={(e) => {
                  const value = e.target.value
                  const role = assignableRoles.find((item) => item.id === value)
                  patchForm({
                    roleId: role?.id || '',
                    role: role?.code || value,
                  })
                }}
              >
                {!form.roleId &&
                  form.role &&
                  !assignableRoles.some((role) => role.code === form.role) && (
                    <option value={form.role}>
                      {getRoleLabel(form.role)} (legacy)
                    </option>
                  )}
                {editId &&
                  form.roleId &&
                  !assignableRoles.some((role) => role.id === form.roleId) && (
                    <option value={form.roleId}>
                      {formatRoleDisplayLabel(
                        getRoleByCode(form.role) || {
                          code: form.role,
                          name: getRoleLabel(form.role),
                          employeeCount: 0,
                        },
                        assignableRoles
                      )}{' '}
                      (неактивна)
                    </option>
                  )}
                {assignableRoles.length === 0 &&
                  [form.role].filter(Boolean).map((roleCode) => (
                    <option key={roleCode} value={roleCode}>
                      {formatRoleDisplayLabel(
                        getRoleByCode(roleCode) || {
                          code: roleCode,
                          name: getRoleLabel(roleCode),
                          employeeCount: 0,
                        },
                        assignableRoles
                      )}
                    </option>
                  ))}
                {assignableRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {formatRoleDisplayLabel(role, assignableRoles)}
                    {!role.isActive ? ' (неактивна)' : ''}
                  </option>
                ))}
              </select>
              <span className="admin-form__hint" id="employee-role-hint">
                {editingSelf
                  ? 'Собственную роль нельзя изменить.'
                  : !canEditRole
                    ? 'Недостаточно прав для изменения роли. Роль определяет права доступа сотрудника.'
                    : 'Роль определяет права доступа сотрудника.'}
              </span>
            </label>

            <label className="admin-form__label">
              Статус
              <select
                className="admin-form__select"
                value={form.employmentStatus}
                disabled={editingSelf || submitting}
                onChange={(e) => patchForm({ employmentStatus: e.target.value })}
              >
                {EMPLOYEE_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {editingSelf && (
                <span className="admin-form__hint">
                  Собственный статус сотрудника нельзя изменить.
                </span>
              )}
            </label>

            {editId && (
              <label className="admin-form__label">
                Дата приёма на работу
                <input
                  className="admin-form__input"
                  type="date"
                  value={form.hiredAt || ''}
                  onChange={(e) => patchForm({ hiredAt: e.target.value })}
                  disabled={submitting}
                  required
                />
                <span className="admin-form__hint">
                  Можно изменить при переносе сотрудников, уже работавших до создания аккаунта.
                </span>
              </label>
            )}

            <div className="admin-form__row">
              <label className="admin-form__label">
                Режим работы
                <select
                  className="admin-form__select"
                  value={form.workMode}
                  onChange={(e) => patchForm({ workMode: e.target.value })}
                  disabled={submitting}
                >
                  {WORK_MODE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-form__label">
                Тип расчёта зарплаты
                <select
                  className="admin-form__select"
                  value={form.salaryCalculationType}
                  onChange={(e) => patchForm({ salaryCalculationType: e.target.value })}
                  disabled={submitting}
                >
                  {SALARY_CALCULATION_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="admin-form__label">
              Статус расчёта
              <select
                className="admin-form__select"
                value={form.payrollParticipation}
                onChange={(e) => patchForm({ payrollParticipation: e.target.value })}
                disabled={submitting}
              >
                {PAYROLL_PARTICIPATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span className="admin-form__hint">
                Исключённые сотрудники не участвуют в зарплатной ведомости. Карточка и доступ к
                платформе не меняются.
              </span>
            </label>
          </fieldset>

          {!cloudMode && workLocations.length > 0 && (
            <label className="admin-form__label">
              Рабочая точка
              <select
                className="admin-form__select"
                value={form.workLocationId || ''}
                onChange={(e) => patchForm({ workLocationId: e.target.value })}
                disabled={submitting}
              >
                <option value="">По умолчанию (активная точка)</option>
                {workLocations
                  .filter((loc) => loc.isActive)
                  .map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
              </select>
            </label>
          )}

          <div className="admin-form__row">
            <label className="admin-form__label">
              Логин *
              <input
                className="admin-form__input"
                value={form.login}
                onChange={(e) => patchForm({ login: e.target.value })}
                required={!editId}
                disabled={Boolean(editId && cloudMode) || submitting}
                readOnly={Boolean(editId && cloudMode)}
              />
              {editId && cloudMode && (
                <span className="admin-form__hint">
                  Изменение логина и данных входа будет доступно после безопасной синхронизации с
                  Auth.
                </span>
              )}
            </label>
            {!editId && (
              <label className="admin-form__label">
                {cloudMode ? 'Временный пароль *' : 'Пароль *'}
                <input
                  className="admin-form__input"
                  type="password"
                  value={form.password}
                  onChange={(e) => patchForm({ password: e.target.value })}
                  required
                  minLength={MIN_EMPLOYEE_TEMP_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  disabled={submitting}
                />
                {cloudMode && (
                  <span className="admin-form__hint">
                    Используется для первого входа сотрудника через Supabase Auth.
                  </span>
                )}
              </label>
            )}
            {editId && !cloudMode && (
              <label className="admin-form__label">
                Пароль (оставьте пустым, чтобы не менять)
                <input
                  className="admin-form__input"
                  type="password"
                  value={form.password}
                  onChange={(e) => patchForm({ password: e.target.value })}
                  autoComplete="new-password"
                  disabled={submitting}
                />
              </label>
            )}
          </div>

          {formError && (
            <p className="admin-form__error" role="alert" id="employee-form-error">
              {formError}
            </p>
          )}
        </form>
      </AdminModal>

      {roleConfirmOpen && (
        <ConfirmDialog
          title="Изменить роль в системе?"
          message={`Изменение роли повлияет на доступ сотрудника к разделам и действиям платформы.\n\nТекущая роль: ${currentRoleLabel}\nНовая роль: ${nextRoleLabel}`}
          confirmLabel="Изменить роль"
          confirmVariant="danger"
          loading={submitting}
          onCancel={() => {
            if (submitting) return
            setRoleConfirmOpen(false)
            setPendingSaveEvent(null)
          }}
          onConfirm={() => {
            if (submitting) return
            performSave(pendingSaveEvent)
          }}
        />
      )}
    </>
  )
}
