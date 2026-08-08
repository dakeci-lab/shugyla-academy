import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../../../context/ToastContext'
import {
  archivePositionGroup,
  createPositionGroup,
  reorderPositionGroups,
  restorePositionGroup,
  updatePositionGroup,
} from '../../../services/positionStructureAdminService'
import { DelayedLoadingSkeleton } from '../../loading/LoadingSkeleton'
import PositionGroupActionsMenu from './PositionGroupActionsMenu'
import PositionGroupFormModal from './PositionGroupFormModal'
import StructureConfirmModal from './StructureConfirmModal'
import StructureEmptyState from './StructureEmptyState'
import StructureErrorState from './StructureErrorState'
import StructureReorderBar from './StructureReorderBar'
import {
  canReorderGroups,
  countPositionsInGroup,
  filterGroups,
  formatStructureError,
  idsEqual,
  moveIdInList,
  positionsLabel,
  sortGroups,
  STRUCTURE_STATUS_FILTERS,
} from './positionStructureUiUtils'

export default function PositionGroupsWorkspace({
  groups,
  positions,
  loading,
  error,
  canManage,
  onReload,
  onDirtyChange,
}) {
  const { success: toastSuccess, error: toastError } = useToast()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('active')
  const [draftOrderIds, setDraftOrderIds] = useState(null)
  const [formState, setFormState] = useState(null)
  const [confirmState, setConfirmState] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [highlightId, setHighlightId] = useState('')

  const serverActiveIds = useMemo(
    () => sortGroups(groups.filter((group) => group.isActive)).map((group) => group.id),
    [groups],
  )

  const displayGroups = useMemo(() => {
    if (draftOrderIds && canReorderGroups({ status, query, canManage })) {
      const byId = new Map(groups.map((group) => [group.id, group]))
      return draftOrderIds.map((id) => byId.get(id)).filter(Boolean)
    }
    return filterGroups(groups, positions, { query, status })
  }, [draftOrderIds, groups, positions, query, status, canManage])

  const reorderEnabled = canReorderGroups({ status, query, canManage })
  const isDirty = Boolean(draftOrderIds) && !idsEqual(draftOrderIds, serverActiveIds)

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

  function ensureDraft() {
    if (!reorderEnabled) return null
    if (draftOrderIds) return draftOrderIds
    const next = [...serverActiveIds]
    setDraftOrderIds(next)
    return next
  }

  function moveGroup(groupId, direction) {
    const current = ensureDraft()
    if (!current) return
    setDraftOrderIds(moveIdInList(current, groupId, direction))
  }

  async function handleSaveReorder() {
    if (!draftOrderIds?.length) return
    setSaving(true)
    try {
      await reorderPositionGroups(draftOrderIds)
      setDraftOrderIds(null)
      await onReload?.()
      toastSuccess('Порядок групп сохранён')
    } catch (err) {
      toastError(formatStructureError(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitForm({ name, description }) {
    setSaving(true)
    setFormError('')
    try {
      if (formState?.mode === 'edit' && formState.group) {
        await updatePositionGroup({
          groupId: formState.group.id,
          name,
          description,
          sortOrder: formState.group.sortOrder,
        })
        toastSuccess('Группа обновлена')
      } else {
        const created = await createPositionGroup({ name, description })
        setHighlightId(created?.id || '')
        toastSuccess('Группа создана')
      }
      setFormState(null)
      await onReload?.()
    } catch (err) {
      setFormError(formatStructureError(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmArchive() {
    const group = confirmState?.group
    if (!group) return
    setSaving(true)
    try {
      await archivePositionGroup(group.id)
      setConfirmState(null)
      await onReload?.()
      toastSuccess('Группа архивирована')
    } catch (err) {
      toastError(formatStructureError(err))
      setConfirmState(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleRestore(group) {
    setSaving(true)
    try {
      await restorePositionGroup(group.id)
      await onReload?.()
      toastSuccess('Группа восстановлена')
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
            <h3 className="structure-workspace__title">Группы должностей</h3>
            {!canManage ? <span className="structure-badge">Только просмотр</span> : null}
          </div>
          <p className="structure-workspace__desc">
            Объединяйте должности по направлениям и настраивайте порядок отображения сотрудников
          </p>
          <p className="structure-workspace__meta">{displayGroups.length} из {groups.length}</p>
        </div>
        {canManage ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setFormState({ mode: 'create' })}
          >
            Создать группу
          </button>
        ) : null}
      </header>

      <div className="structure-toolbar">
        <label className="structure-toolbar__search">
          <span className="sr-only">Поиск групп</span>
          <input
            type="search"
            className="admin-form__input"
            placeholder="Поиск групп"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              if (draftOrderIds) setDraftOrderIds(null)
            }}
          />
        </label>
        <div className="structure-toolbar__filters" role="group" aria-label="Фильтр статуса групп">
          {STRUCTURE_STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`team-role-filters__chip${status === filter.id ? ' team-role-filters__chip--active' : ''}`}
              aria-pressed={status === filter.id}
              onClick={() => {
                setStatus(filter.id)
                if (draftOrderIds) setDraftOrderIds(null)
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
        <DelayedLoadingSkeleton variant="list" count={5} />
      ) : displayGroups.length === 0 ? (
        <StructureEmptyState
          title={groups.length === 0 ? 'Группы не найдены' : 'По запросу ничего не найдено'}
          description={
            groups.length === 0
              ? 'Создайте первую группу, чтобы распределить должности по направлениям'
              : undefined
          }
          action={
            groups.length === 0 && canManage ? (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => setFormState({ mode: 'create' })}
              >
                Создать группу
              </button>
            ) : null
          }
        />
      ) : (
        <div className="structure-list">
          {displayGroups.map((group, index) => {
            const total = countPositionsInGroup(group.id, positions)
            const active = countPositionsInGroup(group.id, positions, { activeOnly: true })
            return (
              <article
                key={group.id}
                className={[
                  'structure-card',
                  !group.isActive ? 'structure-card--archived' : '',
                  highlightId === group.id ? 'structure-card--highlight' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="structure-card__main">
                  <div className="structure-card__title-row">
                    <h4 className="structure-card__title">{group.name}</h4>
                    <span
                      className={`team-role-item__status${group.isActive ? ' team-role-item__status--active' : ''}`}
                    >
                      {group.isActive ? 'Активна' : 'Архивная'}
                    </span>
                  </div>
                  {group.description ? (
                    <p className="structure-card__desc">{group.description}</p>
                  ) : null}
                  <p className="structure-card__meta">
                    {positionsLabel(total)}
                    {active !== total ? ` · активных: ${active}` : ''}
                  </p>
                </div>
                <div className="structure-card__actions">
                  {reorderEnabled ? (
                    <div className="structure-move">
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        aria-label={`Поднять группу «${group.name}» выше`}
                        disabled={index === 0 || saving}
                        onClick={() => moveGroup(group.id, 'up')}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        aria-label={`Опустить группу «${group.name}» ниже`}
                        disabled={index === displayGroups.length - 1 || saving}
                        onClick={() => moveGroup(group.id, 'down')}
                      >
                        ↓
                      </button>
                    </div>
                  ) : null}
                  <PositionGroupActionsMenu
                    group={group}
                    canManage={canManage}
                    onEdit={(item) => setFormState({ mode: 'edit', group: item })}
                    onArchive={(item) =>
                      setConfirmState({
                        type: 'archive-group',
                        group: item,
                        message:
                          'Архивированная группа перестанет быть доступна для новых назначений.',
                      })
                    }
                    onRestore={handleRestore}
                  />
                </div>
              </article>
            )
          })}
        </div>
      )}

      <StructureReorderBar
        visible={isDirty}
        message="Порядок групп изменён"
        saving={saving}
        onCancel={() => setDraftOrderIds(null)}
        onSave={handleSaveReorder}
      />

      <PositionGroupFormModal
        open={Boolean(formState)}
        mode={formState?.mode || 'create'}
        initial={formState?.group}
        saving={saving}
        error={formError}
        onClose={() => {
          if (!saving) {
            setFormState(null)
            setFormError('')
          }
        }}
        onSubmit={handleSubmitForm}
      />

      <StructureConfirmModal
        open={confirmState?.type === 'archive-group'}
        title="Архивировать группу"
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
