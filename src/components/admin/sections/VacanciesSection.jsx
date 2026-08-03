import { useEffect, useMemo, useState } from 'react'
import {
  getVacancies,
  createVacancy,
  updateVacancy,
  deleteVacancy,
  duplicateVacancy,
} from '../../../services/platformDataService'
import { toastSuccess } from '../../../services/notificationService'
import {
  VACANCY_STATUS_LABELS,
  getVacancyPositionLabel,
  vacancyNeedsPositionSelection,
  vacancyHasArchivedPosition,
} from '../../../utils/recruitmentData'
import {
  ensurePositionCatalogLoaded,
  reloadPositionCatalog,
  buildPositionSelectGroups,
  getPositionById,
  isPositionAssignable,
} from '../../../services/positionCatalogService'
import { isCloudMode } from '../../../lib/dataMode'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import AdminModal from '../AdminModal'
import ConfirmDialog from '../ConfirmDialog'
import StatusBadge from '../StatusBadge'
import IconActionButton from '../IconActionButton'
import { PencilIcon, TrashIcon, LinkIcon, CopyIcon } from '../../icons/PlatformIcons'
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
  const [positionGroups, setPositionGroups] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)

  void version

  const vacancies = getVacancies()
  const cloudMode = isCloudMode()

  async function loadCatalog({ force = false, currentPositionId = null } = {}) {
    if (!cloudMode) {
      setPositionGroups([])
      setCatalogError('')
      setCatalogLoading(false)
      return
    }
    setCatalogLoading(true)
    setCatalogError('')
    try {
      if (force) await reloadPositionCatalog()
      else await ensurePositionCatalogLoaded()
      setPositionGroups(
        buildPositionSelectGroups({
          currentPositionId,
          includeArchivedCurrent: Boolean(currentPositionId),
        })
      )
    } catch (err) {
      setCatalogError(err?.message || 'Не удалось загрузить справочник должностей')
      setPositionGroups([])
    } finally {
      setCatalogLoading(false)
    }
  }

  useEffect(() => {
    if (showVacancyForm) {
      loadCatalog({ currentPositionId: vacancyForm.positionId || null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on open / position change
  }, [showVacancyForm, vacancyForm.positionId, cloudMode])

  const selectedPosition = useMemo(() => {
    if (!vacancyForm.positionId) return null
    return getPositionById(vacancyForm.positionId)
  }, [vacancyForm.positionId, positionGroups])

  const selectedArchived = Boolean(
    selectedPosition &&
      (selectedPosition.isActive === false ||
        selectedPosition.groupIsActive === false ||
        selectedPosition.__isCurrentArchived)
  )

  function openCreateVacancy() {
    setEditVacancyId(null)
    setVacancyForm(EMPTY_VACANCY)
    setTitleTouched(false)
    setVacancyError('')
    setShowVacancyForm(true)
  }

  function openEditVacancy(vacancy) {
    setEditVacancyId(vacancy.id)
    setVacancyForm({
      title: vacancy.title,
      description: vacancy.description || '',
      positionId: vacancy.positionId || '',
      role: vacancy.role || '',
      employeeRole: vacancy.employeeRole || vacancy.role || '',
      status: vacancy.status,
    })
    setTitleTouched(true)
    setVacancyError('')
    setShowVacancyForm(true)
  }

  function handlePositionChange(positionId) {
    const position = positionId ? getPositionById(positionId) : null
    setVacancyForm((prev) => {
      const next = { ...prev, positionId }
      if (!editVacancyId && position && (!titleTouched || !prev.title.trim())) {
        next.title = position.name
      }
      return next
    })
  }

  async function handleVacancySave(e) {
    e.preventDefault()
    if (!vacancyForm.title.trim()) {
      setVacancyError('Укажите название вакансии')
      return
    }
    if (!vacancyForm.positionId) {
      setVacancyError('Выберите должность')
      return
    }
    if (!isPositionAssignable(vacancyForm.positionId) && !editVacancyId) {
      setVacancyError('Выберите активную должность из справочника')
      return
    }
    if (
      editVacancyId &&
      vacancyForm.status === 'published' &&
      !isPositionAssignable(vacancyForm.positionId)
    ) {
      setVacancyError('Для публикации выберите активную должность')
      return
    }

    const position = getPositionById(vacancyForm.positionId)
    try {
      const payload = {
        title: vacancyForm.title.trim(),
        description: vacancyForm.description.trim(),
        positionId: vacancyForm.positionId,
        positionNameSnapshot: position?.name || null,
        // Preserve legacy RBAC fields; do not invent from position name.
        role: vacancyForm.role || null,
        employeeRole: vacancyForm.employeeRole || vacancyForm.role || null,
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
      toastSuccess('Вакансия сохранена')
    } catch (err) {
      setVacancyError(err.message || 'Не удалось сохранить вакансию')
    }
  }

  async function handleCopyApplyLink(slug) {
    copyApplyLink(slug)
    toastSuccess('Ссылка скопирована')
  }

  async function handleDuplicateVacancy(vacancy) {
    if (!vacancy.positionId) {
      setActionError('Сначала выберите должность для исходной вакансии')
      openEditVacancy(vacancy)
      return
    }
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
          positionId: created.positionId || '',
          role: created.role || '',
          employeeRole: created.employeeRole || created.role || '',
          status: created.status,
        })
        setTitleTouched(true)
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
              <th>Должность</th>
              <th>Статус</th>
              <th>Кандидатов</th>
              <th>Ссылка</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {vacancies.length === 0 ? (
              <tr>
                <td colSpan={7} className="admin-empty">
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
                    {vacancyNeedsPositionSelection(v) && (
                      <p className="admin-form__hint" style={{ color: 'var(--color-danger, #b42318)' }}>
                        Нужно выбрать должность
                      </p>
                    )}
                    {vacancyHasArchivedPosition(v) && (
                      <p className="admin-form__hint">Должность архивна — выберите активную</p>
                    )}
                  </td>
                  <td>{getVacancyPositionLabel(v)}</td>
                  <td>
                    <StatusBadge
                      label={VACANCY_STATUS_LABELS[v.status]}
                      type={STATUS_BADGE[v.status]}
                    />
                  </td>
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
            {editVacancyId && !vacancyForm.positionId && (
              <p className="admin-form__error" role="alert">
                У вакансии нет связи с централизованной должностью. Выберите должность перед
                сохранением.
              </p>
            )}
            {selectedArchived && (
              <p className="admin-form__hint" role="status">
                Текущая должность архивна. Для публикации выберите активную должность из
                справочника.
              </p>
            )}

            <label className="admin-form__label" htmlFor="vacancy-position-select">
              Должность *
              {catalogError ? (
                <div className="admin-form__error">
                  {catalogError}{' '}
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={() =>
                      loadCatalog({ force: true, currentPositionId: vacancyForm.positionId || null })
                    }
                  >
                    Повторить
                  </button>
                </div>
              ) : null}
              <select
                id="vacancy-position-select"
                className="admin-form__select"
                value={vacancyForm.positionId || ''}
                disabled={catalogLoading || Boolean(catalogError)}
                required
                onChange={(e) => handlePositionChange(e.target.value)}
              >
                <option value="">
                  {catalogLoading ? 'Загрузка должностей…' : 'Выберите должность'}
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
              <span className="admin-form__hint">
                Должность выбирается из справочника платформы. Архивные должности недоступны для
                новых вакансий.
              </span>
            </label>

            <label className="admin-form__label">
              Название вакансии *
              <input
                className="admin-form__input"
                value={vacancyForm.title}
                onChange={(e) => {
                  setTitleTouched(true)
                  setVacancyForm({ ...vacancyForm, title: e.target.value })
                }}
                required
              />
              <span className="admin-form__hint">
                Публичный заголовок. Должность определяется только выбранной записью справочника.
              </span>
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

            {vacancyError && <p className="admin-form__error">{vacancyError}</p>}
          </form>
        </AdminModal>
      )}
    </>
  )
}
