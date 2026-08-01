import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../../../context/ToastContext'
import {
  archivePosition,
  createPosition,
  reorderPositions,
  restorePosition,
  updatePosition,
} from '../../../services/positionStructureAdminService'
import PositionActionsMenu from './PositionActionsMenu'
import PositionFormModal from './PositionFormModal'
import StructureConfirmModal from './StructureConfirmModal'
import StructureEmptyState from './StructureEmptyState'
import StructureErrorState from './StructureErrorState'
import StructureReorderBar from './StructureReorderBar'
import {
  filterPositions,
  formatStructureError,
  groupPositionsByGroup,
  idsEqual,
  moveIdInList,
  positionsLabel,
  sortGroups,
  sortPositions,
  STRUCTURE_STATUS_FILTERS,
} from './positionStructureUiUtils'

export default function PositionsWorkspace({
  groups,
  positions,
  loading,
  error,
  canManage,
  onReload,
  onDirtyChange,
  onGoToGroups,
}) {
  const { success: toastSuccess, error: toastError } = useToast()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('active')
  const [groupFilter, setGroupFilter] = useState('all')
  const [expanded, setExpanded] = useState(() => new Set())
  const [draftByGroup, setDraftByGroup] = useState({})
  const [formState, setFormState] = useState(null)
  const [confirmState, setConfirmState] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [highlightId, setHighlightId] = useState('')

  const filtered = useMemo(
    () => filterPositions(positions, { query, status, groupId: groupFilter }),
    [positions, query, status, groupFilter],
  )

  const sections = useMemo(() => {
    const baseGroups =
      groupFilter === 'all' ? groups : groups.filter((group) => group.id === groupFilter)
    const grouped = groupPositionsByGroup(baseGroups.length ? baseGroups : groups, filtered)
    return grouped.map((section) => {
      const draftIds = draftByGroup[section.group.id]
      if (!draftIds) return section
      const byId = new Map(section.positions.map((item) => [item.id, item]))
      return {
        ...section,
        positions: draftIds.map((id) => byId.get(id)).filter(Boolean),
      }
    })
  }, [groups, filtered, groupFilter, draftByGroup])

  const dirtyGroupId = useMemo(() => {
    for (const [groupId, draftIds] of Object.entries(draftByGroup)) {
      const serverIds = sortPositions(
        positions.filter((item) => item.groupId === groupId && item.isActive),
      ).map((item) => item.id)
      if (!idsEqual(draftIds, serverIds)) return groupId
    }
    return null
  }, [draftByGroup, positions])

  const isDirty = Boolean(dirtyGroupId)
  const reorderEnabled =
    canManage && status === 'active' && !query.trim()

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  useEffect(() => {
    if (!isDirty) return undefined
    function onBeforeUnload(event) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    if (!sections.length) return
    setExpanded((prev) => {
      if (prev.size > 0 && !query.trim()) return prev
      const next = new Set(prev)
      if (query.trim()) {
        sections.forEach((section) => next.add(section.group.id))
      } else if (prev.size === 0) {
        sections.slice(0, 3).forEach((section) => next.add(section.group.id))
      }
      return next
    })
  }, [sections, query])

  function clearDrafts() {
    setDraftByGroup({})
  }

  function ensureDraft(groupId) {
    if (!reorderEnabled) return null
    if (draftByGroup[groupId]) return draftByGroup[groupId]
    const serverIds = sortPositions(
      positions.filter((item) => item.groupId === groupId && item.isActive),
    ).map((item) => item.id)
    setDraftByGroup((prev) => ({ ...prev, [groupId]: serverIds }))
    return serverIds
  }

  function movePosition(groupId, positionId, direction) {
    const current = ensureDraft(groupId)
    if (!current) return
    setDraftByGroup((prev) => ({
      ...prev,
      [groupId]: moveIdInList(current, positionId, direction),
    }))
  }

  async function handleSaveReorder() {
    if (!dirtyGroupId || !draftByGroup[dirtyGroupId]) return
    setSaving(true)
    try {
      await reorderPositions(dirtyGroupId, draftByGroup[dirtyGroupId])
      clearDrafts()
      await onReload?.()
      toastSuccess('Порядок должностей сохранён')
    } catch (err) {
      toastError(formatStructureError(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitForm({ name, description, groupId }) {
    setSaving(true)
    setFormError('')
    try {
      if (formState?.mode === 'edit' && formState.position) {
        await updatePosition({
          positionId: formState.position.id,
          groupId,
          name,
          description,
          sortOrder: formState.position.sortOrder,
        })
        toastSuccess('Должность обновлена')
      } else {
        const created = await createPosition({ groupId, name, description })
        setHighlightId(created?.id || '')
        toastSuccess('Должность создана')
      }
      setFormState(null)
      clearDrafts()
      await onReload?.()
    } catch (err) {
      setFormError(formatStructureError(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmArchive() {
    const position = confirmState?.position
    if (!position) return
    setSaving(true)
    try {
      await archivePosition(position.id)
      setConfirmState(null)
      clearDrafts()
      await onReload?.()
      toastSuccess('Должность архивирована')
    } catch (err) {
      toastError(formatStructureError(err))
      setConfirmState(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleRestore(position) {
    if (position.groupIsActive === false) {
      toastError('Сначала восстановите группу должности.')
      return
    }
    setSaving(true)
    try {
      await restorePosition(position.id)
      clearDrafts()
      await onReload?.()
      toastSuccess('Должность восстановлена')
    } catch (err) {
      toastError(formatStructureError(err))
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return <StructureErrorState message={error} onRetry={onReload} />
  }

  return (
    <div className="structure-workspace">
      <header className="structure-workspace__header">
        <div>
          <div className="structure-workspace__title-row">
            <h3 className="structure-workspace__title">Должности</h3>
            {!canManage ? <span className="structure-badge">Только просмотр</span> : null}
          </div>
          <p className="structure-workspace__desc">
            Настройте фактические должности сотрудников независимо от ролей доступа
          </p>
          <p className="structure-info">
            Должность определяет, кем работает сотрудник. Роль в системе определяет, какие разделы и
            действия ему доступны.
          </p>
          <p className="structure-workspace__meta">
            {filtered.length} из {positions.length}
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setFormState({ mode: 'create' })}
          >
            Создать должность
          </button>
        ) : null}
      </header>

      <div className="structure-toolbar structure-toolbar--positions">
        <label className="structure-toolbar__search">
          <span className="sr-only">Поиск должностей</span>
          <input
            type="search"
            className="admin-form__input"
            placeholder="Поиск должностей"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              clearDrafts()
            }}
          />
        </label>
        <label className="structure-toolbar__select">
          <span className="sr-only">Фильтр группы</span>
          <select
            className="admin-form__select"
            value={groupFilter}
            onChange={(event) => {
              setGroupFilter(event.target.value)
              clearDrafts()
            }}
          >
            <option value="all">Все группы</option>
            {sortGroups(groups).map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
                {!group.isActive ? ' (архив)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="structure-toolbar__filters" role="group" aria-label="Фильтр статуса должностей">
          {STRUCTURE_STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`team-role-filters__chip${status === filter.id ? ' team-role-filters__chip--active' : ''}`}
              aria-pressed={status === filter.id}
              onClick={() => {
                setStatus(filter.id)
                clearDrafts()
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {canManage && !reorderEnabled ? (
        <p className="structure-hint">
          Изменение порядка доступно при фильтре «Активные» и пустом поиске.
        </p>
      ) : null}

      {loading ? (
        <div className="team-mgmt__skeleton-stack" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="team-mgmt__skeleton team-mgmt__skeleton--card" />
          ))}
        </div>
      ) : sections.length === 0 ? (
        <StructureEmptyState
          title={positions.length === 0 ? 'Должности не найдены' : 'По запросу ничего не найдено'}
          description={
            positions.length === 0
              ? 'Создайте первую должность для сотрудников'
              : undefined
          }
          action={
            positions.length === 0 && canManage ? (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => setFormState({ mode: 'create' })}
              >
                Создать должность
              </button>
            ) : null
          }
        />
      ) : (
        <div className="structure-sections">
          {sections.map((section) => {
            const open = expanded.has(section.group.id)
            return (
              <section key={section.group.id} className="structure-section">
                <div className="structure-section__head">
                  <button
                    type="button"
                    className="structure-section__toggle"
                    aria-expanded={open}
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev)
                        if (next.has(section.group.id)) next.delete(section.group.id)
                        else next.add(section.group.id)
                        return next
                      })
                    }
                  >
                    <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                    <span>
                      <strong>{section.group.name}</strong>
                      <span className="structure-section__count">
                        {positionsLabel(section.positions.length)}
                      </span>
                    </span>
                  </button>
                </div>
                {open ? (
                  <div className="structure-section__body">
                    {section.positions.map((position, index) => (
                      <article
                        key={position.id}
                        className={[
                          'structure-card structure-card--position',
                          !position.isActive ? 'structure-card--archived' : '',
                          highlightId === position.id ? 'structure-card--highlight' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <div className="structure-card__main">
                          <div className="structure-card__title-row">
                            <h4 className="structure-card__title">{position.name}</h4>
                            <span
                              className={`team-role-item__status${position.isActive ? ' team-role-item__status--active' : ''}`}
                            >
                              {position.isActive ? 'Активна' : 'Архивная'}
                            </span>
                          </div>
                          <p className="structure-card__meta">Группа: {position.groupName || section.group.name}</p>
                          {position.description ? (
                            <p className="structure-card__desc">{position.description}</p>
                          ) : null}
                        </div>
                        <div className="structure-card__actions">
                          {reorderEnabled && position.isActive ? (
                            <div className="structure-move">
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                aria-label={`Поднять должность «${position.name}» выше`}
                                disabled={index === 0 || saving}
                                onClick={() => movePosition(section.group.id, position.id, 'up')}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                aria-label={`Опустить должность «${position.name}» ниже`}
                                disabled={index === section.positions.length - 1 || saving}
                                onClick={() => movePosition(section.group.id, position.id, 'down')}
                              >
                                ↓
                              </button>
                            </div>
                          ) : null}
                          <PositionActionsMenu
                            position={position}
                            canManage={canManage}
                            onEdit={(item) => setFormState({ mode: 'edit', position: item })}
                            onArchive={(item) =>
                              setConfirmState({
                                type: 'archive-position',
                                position: item,
                                message:
                                  'Архивированную должность нельзя будет назначать новым сотрудникам. История существующих сотрудников сохранится.',
                              })
                            }
                            onRestore={handleRestore}
                          />
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      )}

      <StructureReorderBar
        visible={isDirty}
        message="Порядок должностей изменён"
        saving={saving}
        onCancel={clearDrafts}
        onSave={handleSaveReorder}
      />

      <PositionFormModal
        open={Boolean(formState)}
        mode={formState?.mode || 'create'}
        initial={formState?.position}
        groups={groups}
        saving={saving}
        error={formError}
        onGoToGroups={onGoToGroups}
        onClose={() => {
          if (!saving) {
            setFormState(null)
            setFormError('')
          }
        }}
        onSubmit={handleSubmitForm}
      />

      <StructureConfirmModal
        open={confirmState?.type === 'archive-position'}
        title="Архивировать должность"
        message={confirmState?.message || ''}
        confirmLabel="Архивировать"
        danger
        busy={saving}
        onConfirm={handleConfirmArchive}
        onClose={() => setConfirmState(null)}
      />
    </div>
  )
}
