import { useEffect, useMemo, useState } from 'react'
import {
  EMPTY_EMPLOYEE_FORM,
  employeeToForm,
  validateEmployeeForm,
  buildEmployeeCloudUpdateChanges,
  EMPLOYEE_STATUS_OPTIONS,
  getStaffEmployees,
  isActiveStaffEmployee,
  isDeactivatedStaffEmployee,
} from '../../../utils/employeeData'
import {
  createEmployee,
  updateEmployee,
  checkEmployeeLoginAvailability,
} from '../../../services/platformDataService'
import { resetEmployeePasswordAsAdmin } from '../../../services/employeeAdminService'
import { getRoleLabel } from '../../../data/roles'
import { getRoleByCode, getRolesForEmployeeForm } from '../../../services/rbacService'
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
import ProfileAvatarEditor from '../../ProfileAvatarEditor'
import '../RecruitmentSection.css'
import './EmployeeEditModal.css'

/**
 * Shared create/edit employee modal used by the list and employee profile.
 * The system role is the only job/access attribute (positions were removed in stage 17).
 */
export default function EmployeeEditModal({
  employee = null,
  initialForm = null,
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
  const [assignableRoles, setAssignableRoles] = useState([])
  const [avatarRevision, setAvatarRevision] = useState(0)
  const [roleConfirmOpen, setRoleConfirmOpen] = useState(false)
  const [pendingSaveEvent, setPendingSaveEvent] = useState(null)
  const [passwordResetConfirmOpen, setPasswordResetConfirmOpen] = useState(false)
  const [passwordResetting, setPasswordResetting] = useState(false)
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [loginCheck, setLoginCheck] = useState({ status: 'idle', suggestion: '' })

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
    setPasswordResetConfirmOpen(false)
    setPasswordResetting(false)
    setTemporaryPassword('')
  }, [employee, initialForm])

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

  // Live login-availability check on the create form only. Advisory: the actual
  // create call still enforces the conflict server-side (see admin-create-employee).
  useEffect(() => {
    if (editId || !cloudMode) {
      setLoginCheck({ status: 'idle', suggestion: '' })
      return undefined
    }
    const login = form.login.trim()
    if (!login) {
      setLoginCheck({ status: 'idle', suggestion: '' })
      return undefined
    }

    let cancelled = false
    setLoginCheck({ status: 'checking', suggestion: '' })

    const timer = setTimeout(async () => {
      const result = await checkEmployeeLoginAvailability(login)
      if (cancelled || !result) {
        if (!cancelled) setLoginCheck({ status: 'idle', suggestion: '' })
        return
      }
      if (result.available) {
        if (!cancelled) setLoginCheck({ status: 'available', suggestion: '' })
        return
      }

      // Taken — probe login2, login3, … for a free suffix to suggest.
      for (let suffix = 2; suffix <= 9; suffix += 1) {
        if (cancelled) return
        const candidate = `${login}${suffix}`
        const candidateResult = await checkEmployeeLoginAvailability(candidate)
        if (cancelled) return
        if (candidateResult?.available) {
          setLoginCheck({ status: 'taken', suggestion: candidate })
          return
        }
      }
      setLoginCheck({ status: 'taken', suggestion: '' })
    }, 500)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [form.login, editId, cloudMode])

  const editingSelf = useMemo(
    () => Boolean(editId && sessionUser?.id != null && Number(sessionUser.id) === Number(editId)),
    [editId, sessionUser?.id]
  )

  const canEditRole =
    !editingSelf &&
    (editId
      ? can(sessionUser, PERMISSION_CODES.EMPLOYEES_MANAGE_ROLES)
      : can(sessionUser, PERMISSION_CODES.EMPLOYEES_CREATE) ||
        can(sessionUser, PERMISSION_CODES.EMPLOYEES_MANAGE_ROLES))

  const canResetPassword = Boolean(
    cloudMode &&
      editId &&
      employee &&
      !editingSelf &&
      isActiveStaffEmployee(employee) &&
      employee.authLinked === true &&
      can(sessionUser, PERMISSION_CODES.EMPLOYEES_MANAGE_ROLES)
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
    if (submitting || passwordResetting || deactivating || activating) return

    if (!editId && cloudMode) {
      const passwordError = validateEmployeeTemporaryPassword(form.password)
      if (passwordError) {
        setFormError(passwordError)
        return
      }
    }

    const error = validateEmployeeForm(form, editId)
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
            login: form.login.trim(),
            employmentStatus: form.employmentStatus,
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
          login: form.login.trim(),
          employmentStatus: form.employmentStatus,
          ...(form.avatarUrl ? { avatarUrl: form.avatarUrl } : {}),
          ...(form.password?.trim() ? { password: form.password } : {}),
        }
        const newUserId = await createEmployee(payload)
        await onSaved?.({ id: newUserId, mode: 'create' })
        showSuccess('Сотрудник успешно создан')
        onClose?.()
      }
    } catch (err) {
      const message = err.message || 'Не удалось сохранить сотрудника'
      setFormError(message)
      showError(message)
    } finally {
      setSubmitting(false)
      setRoleConfirmOpen(false)
      setPendingSaveEvent(null)
    }
  }

  async function handleSave(event) {
    event.preventDefault()
    if (submitting || passwordResetting || deactivating || activating) return

    if (roleChanged()) {
      setPendingSaveEvent(event)
      setRoleConfirmOpen(true)
      return
    }
    await performSave()
  }

  function handleClose() {
    if (submitting || passwordResetting) return
    setPasswordResetConfirmOpen(false)
    setTemporaryPassword('')
    onClose?.()
  }

  async function handlePasswordResetConfirm() {
    if (!canResetPassword || passwordResetting) return

    setPasswordResetting(true)
    setFormError('')
    setTemporaryPassword('')
    try {
      const result = await resetEmployeePasswordAsAdmin(editId)
      setTemporaryPassword(result.temporaryPassword)
      setPasswordResetConfirmOpen(false)
      showSuccess('Временный пароль создан. Передайте его сотруднику безопасным способом.')
    } catch (err) {
      const message = err?.message || 'Не удалось сбросить пароль сотрудника'
      setFormError(message)
      showError(message)
    } finally {
      setPasswordResetting(false)
    }
  }

  async function handleTemporaryPasswordCopy() {
    if (!temporaryPassword) return
    try {
      await navigator.clipboard.writeText(temporaryPassword)
      showSuccess('Временный пароль скопирован')
    } catch {
      showError('Не удалось скопировать пароль. Выделите и скопируйте его вручную.')
    }
  }

  const saveLabel = submitting ? 'Сохранение…' : 'Сохранить'

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

  return (
    <>
      <AdminModal
        title={editId ? 'Редактировать сотрудника' : 'Добавить сотрудника'}
        onClose={submitting || passwordResetting ? () => {} : handleClose}
        wide
        footer={
          <div className="employees-modal-footer">
            {showDeactivateAction && (
              <Can permission={PERMISSION_CODES.EMPLOYEES_DEACTIVATE}>
                <button
                  type="button"
                  className="btn employees-modal-footer__status-action employees-modal-footer__status-action--danger"
                  disabled={submitting || passwordResetting || deactivating || activating}
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
                  disabled={submitting || passwordResetting || deactivating || activating}
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
                onClick={handleClose}
                disabled={submitting || passwordResetting}
              >
                Отмена
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                form="employee-form"
                disabled={submitting || passwordResetting || deactivating || activating}
                aria-busy={submitting}
              >
                {saveLabel}
              </button>
            </div>
          </div>
        }
      >
        <form id="employee-form" className="admin-form" onSubmit={handleSave}>

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
            <legend className="employee-form-section__legend">Доступ</legend>
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
          </fieldset>

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
              {!editId && cloudMode && loginCheck.status === 'checking' && (
                <span className="admin-form__hint">Проверка логина…</span>
              )}
              {!editId && cloudMode && loginCheck.status === 'available' && (
                <span className="admin-form__hint admin-form__hint--ok">Логин свободен</span>
              )}
              {!editId && cloudMode && loginCheck.status === 'taken' && (
                <span className="admin-form__hint admin-form__hint--warning">
                  Логин уже занят другим сотрудником.
                  {loginCheck.suggestion && (
                    <>
                      {' '}
                      Свободен:{' '}
                      <button
                        type="button"
                        className="admin-form__hint-action"
                        onClick={() => patchForm({ login: loginCheck.suggestion })}
                      >
                        {loginCheck.suggestion}
                      </button>
                    </>
                  )}
                </span>
              )}
            </label>
            {canResetPassword && (
              <div className="employee-password-reset">
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => setPasswordResetConfirmOpen(true)}
                  disabled={submitting || passwordResetting}
                >
                  {passwordResetting ? 'Сброс пароля…' : 'Сбросить пароль'}
                </button>
                <span className="admin-form__hint">
                  Система создаст новый временный пароль и покажет его только один раз.
                </span>
              </div>
            )}
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

          {temporaryPassword && (
            <div className="employee-password-result" role="status">
              <strong>Новый временный пароль</strong>
              <div className="employee-password-result__value">
                <input
                  className="admin-form__input"
                  value={temporaryPassword}
                  readOnly
                  aria-label="Новый временный пароль"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={handleTemporaryPasswordCopy}
                >
                  Скопировать пароль
                </button>
              </div>
              <span className="admin-form__hint">
                Передайте пароль сотруднику безопасным способом. После входа сотрудник должен
                изменить его в настройках профиля. После закрытия окна пароль больше не покажется.
              </span>
            </div>
          )}

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

      {passwordResetConfirmOpen && (
        <ConfirmDialog
          title="Сбросить пароль сотрудника?"
          message="Текущий пароль сразу перестанет работать. Новый временный пароль будет показан только один раз после сброса."
          confirmLabel="Сбросить пароль"
          confirmVariant="danger"
          loading={passwordResetting}
          onCancel={() => {
            if (passwordResetting) return
            setPasswordResetConfirmOpen(false)
          }}
          onConfirm={handlePasswordResetConfirm}
        />
      )}
    </>
  )
}
