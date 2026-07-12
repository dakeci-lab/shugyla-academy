import { useState } from 'react'
import {
  getVacancies,
  createVacancy,
  updateVacancy,
  deleteVacancy,
  duplicateVacancy,
} from '../../../services/academyDataService'
import { toastSuccess } from '../../../services/notificationService'
import {
  VACANCY_STATUS_LABELS,
  VACANCY_ROLES,
  getVacancyRoleLabel,
  isVacancyPassingScoreLocked,
} from '../../../utils/recruitmentData'
import { EMPLOYEE_FORM_ROLES, ROLES } from '../../../data/roles'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import AdminModal from '../AdminModal'
import ConfirmDialog from '../ConfirmDialog'
import StatusBadge from '../StatusBadge'
import IconActionButton from '../IconActionButton'
import { PencilIcon, TrashIcon, LinkIcon, CopyIcon } from '../../icons/PlatformIcons'
import VacancyQuestionEditor from '../VacancyQuestionEditor'
import { copyApplyLink, EMPTY_VACANCY, STATUS_BADGE } from './recruitmentAdminShared'
import '../admin-shared.css'
import '../IconActionButton.css'
import '../RecruitmentSection.css'

/** Управление вакансиями (HR) */
export default function VacanciesSection() {
  const { version, refresh } = useAdminRefresh()
  const [showVacancyForm, setShowVacancyForm] = useState(false)
  const [editVacancyId, setEditVacancyId] = useState(null)
  const [vacancyForm, setVacancyForm] = useState(EMPTY_VACANCY)
  const [vacancyError, setVacancyError] = useState('')
  const [actionError, setActionError] = useState('')
  const [deleteVacancyTarget, setDeleteVacancyTarget] = useState(null)
  const [deletingVacancy, setDeletingVacancy] = useState(false)
  const [duplicatingVacancyId, setDuplicatingVacancyId] = useState(null)

  void version

  const vacancies = getVacancies()
  const editingVacancy = editVacancyId ? vacancies.find((v) => v.id === editVacancyId) : null
  const passingScoreLocked = isVacancyPassingScoreLocked(editingVacancy)

  function openCreateVacancy() {
    setEditVacancyId(null)
    setVacancyForm(EMPTY_VACANCY)
    setVacancyError('')
    setShowVacancyForm(true)
  }

  function openEditVacancy(vacancy) {
    setEditVacancyId(vacancy.id)
    setVacancyForm({
      title: vacancy.title,
      description: vacancy.description || '',
      role: vacancy.role,
      employeeRole: vacancy.employeeRole || vacancy.role,
      passingScore: vacancy.passingScore,
      status: vacancy.status,
    })
    setVacancyError('')
    setShowVacancyForm(true)
  }

  function updateVacancyRole(role) {
    setVacancyForm((prev) => ({
      ...prev,
      role,
      employeeRole: prev.employeeRole === prev.role ? role : prev.employeeRole,
    }))
  }

  async function handleVacancySave(e) {
    e.preventDefault()
    if (!vacancyForm.title.trim()) {
      setVacancyError('Укажите название вакансии')
      return
    }
    try {
      const payload = {
        title: vacancyForm.title.trim(),
        description: vacancyForm.description.trim(),
        role: vacancyForm.role,
        employeeRole: vacancyForm.employeeRole || vacancyForm.role,
        passingScore: Number(vacancyForm.passingScore) || 80,
        status: vacancyForm.status,
      }
      if (editVacancyId) {
        await updateVacancy(editVacancyId, payload)
      } else {
        const id = await createVacancy(payload)
        setEditVacancyId(id)
      }
      setVacancyError('')
      await refresh()
    } catch (err) {
      setVacancyError(err.message || 'Не удалось сохранить вакансию')
    }
  }

  async function handleCopyApplyLink(slug) {
    copyApplyLink(slug)
    toastSuccess('Ссылка скопирована')
  }

  async function handleDuplicateVacancy(vacancy) {
    setDuplicatingVacancyId(vacancy.id)
    setActionError('')
    try {
      const newId = await duplicateVacancy(vacancy.id)
      await refresh()
      setEditVacancyId(newId)
      const created = getVacancies().find((v) => v.id === newId)
      if (created) {
        setVacancyForm({
          title: created.title,
          description: created.description || '',
          role: created.role,
          employeeRole: created.employeeRole || created.role,
          passingScore: created.passingScore,
          status: created.status,
        })
      }
      setShowVacancyForm(true)
      toastSuccess('Вакансия продублирована как черновик')
    } catch (err) {
      setActionError(err.message || 'Не удалось продублировать вакансию')
    } finally {
      setDuplicatingVacancyId(null)
    }
  }

  async function confirmDeleteVacancy() {
    if (!deleteVacancyTarget) return
    setDeletingVacancy(true)
    setActionError('')
    try {
      await deleteVacancy(deleteVacancyTarget.id)
      setDeleteVacancyTarget(null)
      await refresh()
    } catch (err) {
      setActionError(err.message || 'Не удалось удалить вакансию')
    } finally {
      setDeletingVacancy(false)
    }
  }

  return (
    <>
      {actionError && <p className="admin-form__error">{actionError}</p>}

      <div className="admin-toolbar">
        <span className="admin-toolbar__info">{vacancies.length} вакансий</span>
        <button type="button" className="btn btn--primary btn--sm" onClick={openCreateVacancy}>
          + Создать вакансию
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table recruitment-vacancies-table">
          <thead>
            <tr>
              <th className="recruitment-vacancies-table__index">№</th>
              <th>Название вакансии</th>
              <th>Роль</th>
              <th>Статус</th>
              <th>Проходной %</th>
              <th>Кандидатов</th>
              <th>Ссылка</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {vacancies.length === 0 ? (
              <tr>
                <td colSpan={8} className="admin-empty">
                  Вакансии не созданы
                </td>
              </tr>
            ) : (
              vacancies.map((v, index) => (
                <tr key={v.id}>
                  <td className="recruitment-vacancies-table__index">{index + 1}</td>
                  <td>
                    <button
                      type="button"
                      className="vacancy-row-link"
                      onClick={() => openEditVacancy(v)}
                    >
                      {v.title}
                    </button>
                  </td>
                  <td>{getVacancyRoleLabel(v.employeeRole || v.role)}</td>
                  <td>
                    <StatusBadge
                      label={VACANCY_STATUS_LABELS[v.status]}
                      type={STATUS_BADGE[v.status]}
                    />
                  </td>
                  <td>{v.passingScore}%</td>
                  <td>{v.candidateCount ?? 0}</td>
                  <td>
                    <code className="admin-code recruitment-vacancies-table__link">
                      /apply/{v.slug}
                    </code>
                  </td>
                  <td>
                    <div className="admin-table__actions">
                      <IconActionButton
                        label="Редактировать вакансию"
                        variant="primary"
                        onClick={() => openEditVacancy(v)}
                      >
                        <PencilIcon />
                      </IconActionButton>
                      <IconActionButton
                        label="Дублировать вакансию"
                        onClick={() => handleDuplicateVacancy(v)}
                        disabled={duplicatingVacancyId === v.id}
                      >
                        <CopyIcon />
                      </IconActionButton>
                      <IconActionButton
                        label="Скопировать ссылку"
                        onClick={() => handleCopyApplyLink(v.slug)}
                      >
                        <LinkIcon />
                      </IconActionButton>
                      <IconActionButton
                        label="Удалить вакансию"
                        variant="danger"
                        onClick={() => setDeleteVacancyTarget(v)}
                      >
                        <TrashIcon />
                      </IconActionButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {deleteVacancyTarget && (
        <ConfirmDialog
          title="Удалить вакансию?"
          message={`Вакансия «${deleteVacancyTarget.title}» будет удалена без возможности восстановления.`}
          confirmLabel="Удалить"
          onCancel={() => setDeleteVacancyTarget(null)}
          onConfirm={confirmDeleteVacancy}
          loading={deletingVacancy}
        />
      )}

      {showVacancyForm && (
        <AdminModal
          title={editVacancyId ? 'Редактировать вакансию' : 'Создать вакансию'}
          onClose={() => setShowVacancyForm(false)}
          xwide
          footer={
            <>
              <button type="button" className="btn btn--outline" onClick={() => setShowVacancyForm(false)}>
                Закрыть
              </button>
              <button type="submit" className="btn btn--primary" form="vacancy-form">
                Сохранить
              </button>
            </>
          }
        >
          <form id="vacancy-form" className="admin-form" onSubmit={handleVacancySave}>
            <label className="admin-form__label">
              Название вакансии *
              <input
                className="admin-form__input"
                value={vacancyForm.title}
                onChange={(e) => setVacancyForm({ ...vacancyForm, title: e.target.value })}
                required
              />
            </label>
            <label className="admin-form__label">
              Описание
              <textarea
                className="admin-form__input"
                rows={3}
                value={vacancyForm.description}
                onChange={(e) => setVacancyForm({ ...vacancyForm, description: e.target.value })}
              />
            </label>
            <div className="admin-form__row">
              <label className="admin-form__label">
                Роль вакансии
                <select
                  className="admin-form__select"
                  value={vacancyForm.role}
                  onChange={(e) => updateVacancyRole(e.target.value)}
                >
                  {VACANCY_ROLES.map((roleId) => (
                    <option key={roleId} value={roleId}>
                      {getVacancyRoleLabel(roleId)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-form__label">
                Роль сотрудника после найма
                <select
                  className="admin-form__select"
                  value={vacancyForm.employeeRole}
                  onChange={(e) => setVacancyForm({ ...vacancyForm, employeeRole: e.target.value })}
                >
                  {EMPLOYEE_FORM_ROLES.map((roleId) => (
                    <option key={roleId} value={roleId}>
                      {ROLES[roleId]?.label || roleId}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-form__label">
                Проходной балл %
                <input
                  className="admin-form__input"
                  type="number"
                  min={0}
                  max={100}
                  value={vacancyForm.passingScore}
                  onChange={(e) => setVacancyForm({ ...vacancyForm, passingScore: e.target.value })}
                  disabled={passingScoreLocked}
                />
                {passingScoreLocked && (
                  <span className="admin-form__hint">
                    Проходной процент зафиксирован — по вакансии уже есть кандидаты.
                  </span>
                )}
              </label>
              <label className="admin-form__label">
                Статус
                <select
                  className="admin-form__select"
                  value={vacancyForm.status}
                  onChange={(e) => setVacancyForm({ ...vacancyForm, status: e.target.value })}
                >
                  <option value="draft">Черновик</option>
                  <option value="published">Опубликовано</option>
                  <option value="archived">Архив</option>
                </select>
                <span className="admin-form__hint">
                  Публикация, снятие с публикации и архивирование выполняются через статус вакансии.
                </span>
              </label>
            </div>
            {vacancyError && <p className="admin-form__error">{vacancyError}</p>}
          </form>

          <div className="vacancy-questions-block">
            {editVacancyId ? (
              <VacancyQuestionEditor vacancyId={editVacancyId} vacancy={editingVacancy} />
            ) : (
              <p className="admin-form__hint">
                Сохраните вакансию, чтобы добавить фильтр-вопросы для кандидата.
              </p>
            )}
          </div>
        </AdminModal>
      )}
    </>
  )
}
