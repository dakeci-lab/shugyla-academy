import { useEffect, useMemo, useState } from 'react'
import {
  EMPTY_EMPLOYEE_FORM,
  employeeToForm,
  validateEmployeeForm,
  EMPLOYEE_STATUS_OPTIONS,
  getStaffEmployees,
  isActiveStaffEmployee,
  isDeactivatedStaffEmployee,
} from '../../../utils/employeeData'
import {
  createEmployee,
  updateEmployee,
  linkCandidateToEmployee,
  getWorkLocations,
} from '../../../services/academyDataService'
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
import { PERMISSION_CODES } from '../../../config/permissions'
import AdminModal from '../AdminModal'
import EmployeeAvatar from '../../EmployeeAvatar'
import ProfileAvatarEditor from '../../ProfileAvatarEditor'
import '../RecruitmentSection.css'
import './EmployeeEditModal.css'

/**
 * Shared create/edit employee modal used by the list and employee profile.
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

  useEffect(() => {
    setForm(
      employee
        ? employeeToForm(employee)
        : { ...EMPTY_EMPLOYEE_FORM, ...(initialForm || {}) }
    )
    setFormError('')
    setAvatarRevision(0)
  }, [employee, initialForm, sourceCandidateId])

  useEffect(() => {
    getRolesForEmployeeForm(form.role, form.roleId)
      .then(setAssignableRoles)
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

  async function handleSave(event) {
    event.preventDefault()
    if (submitting || deactivating || activating) return

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

    const selectedRole =
      assignableRoles.find((role) => role.id === form.roleId) ||
      getRoleByCode(form.role) ||
      assignableRoles.find((role) => role.code === form.role)
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
          await updateEmployee(editId, {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            roleId: selectedRole?.id || form.roleId || null,
            position: selectedRole?.name || getRoleLabel(roleCode),
            employmentStatus: form.employmentStatus,
            avatarUrl: form.avatarUrl || null,
          })
        } else {
          await updateEmployee(editId, {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            role: roleCode,
            roleId: selectedRole?.id || form.roleId || null,
            login: form.login.trim(),
            position: selectedRole?.name || getRoleLabel(roleCode),
            employmentStatus: form.employmentStatus,
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
          login: form.login.trim(),
          position: selectedRole?.name || getRoleLabel(roleCode),
          employmentStatus: form.employmentStatus,
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
    } finally {
      setSubmitting(false)
    }
  }

  const saveLabel = submitting
    ? 'Сохранение…'
    : sourceCandidateId
      ? 'Создать сотрудника'
      : 'Сохранить'

  return (
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
                Данные заполнены из карточки кандидата. Логин и пароль укажите вручную.
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

        <label className="admin-form__label">
          Роль в системе *
          <select
            className="admin-form__select"
            value={form.roleId || form.role}
            disabled={editingSelf || submitting}
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
          {editingSelf && (
            <span className="admin-form__hint">Нельзя изменить собственную роль.</span>
          )}
          {!editingSelf && (
            <span className="admin-form__hint">
              Роль определяет доступ к разделам платформы через RBAC.
            </span>
          )}
        </label>

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
                Изменение логина и данных входа будет доступно после безопасной синхронизации с Auth.
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
            <span className="admin-form__hint">Нельзя изменить собственный статус.</span>
          )}
        </label>

        {formError && <p className="admin-form__error">{formError}</p>}
      </form>
    </AdminModal>
  )
}
