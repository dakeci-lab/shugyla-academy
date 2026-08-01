import { useEffect, useState } from 'react'
import AdminModal from '../AdminModal'
import {
  DESCRIPTION_MAX,
  NAME_MAX,
  sortGroups,
  validateDescription,
  validateName,
} from './positionStructureUiUtils'

const EMPTY = { name: '', description: '', groupId: '' }

export default function PositionFormModal({
  open,
  mode = 'create',
  initial,
  groups = [],
  saving,
  error,
  onClose,
  onSubmit,
  onGoToGroups,
}) {
  const [form, setForm] = useState(EMPTY)
  const [localError, setLocalError] = useState('')

  const activeGroups = sortGroups(groups.filter((group) => group.isActive))

  useEffect(() => {
    if (!open) return
    const preferred =
      initial?.groupId && activeGroups.some((group) => group.id === initial.groupId)
        ? initial.groupId
        : activeGroups[0]?.id || ''
    setForm({
      name: initial?.name || '',
      description: initial?.description || '',
      groupId: preferred,
    })
    setLocalError('')
    // Reset only when modal opens or the edited entity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id, initial?.groupId, initial?.name, initial?.description])

  if (!open) return null

  const nameError = validateName(form.name)
  const descriptionError = validateDescription(form.description)
  const groupError = form.groupId ? '' : 'Выберите группу'
  const invalid = Boolean(nameError || descriptionError || groupError || activeGroups.length === 0)

  function handleSubmit(event) {
    event?.preventDefault?.()
    if (invalid) {
      setLocalError(nameError || descriptionError || groupError || 'Нет активных групп')
      return
    }
    onSubmit({
      name: form.name.trim(),
      description: form.description.trim() || null,
      groupId: form.groupId,
    })
  }

  return (
    <AdminModal
      wide
      title={mode === 'edit' ? 'Редактирование должности' : 'Создание должности'}
      onClose={saving ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleSubmit}
            disabled={saving || invalid}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </>
      }
    >
      <form className="structure-form" onSubmit={handleSubmit}>
        <label className="admin-form__label">
          Название *
          <input
            className="admin-form__input"
            value={form.name}
            maxLength={NAME_MAX}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
        </label>

        <label className="admin-form__label">
          Группа *
          {activeGroups.length === 0 ? (
            <div className="structure-form__hint">
              <p>Нет активных групп для назначения должности.</p>
              {onGoToGroups ? (
                <button type="button" className="btn btn--ghost btn--sm" onClick={onGoToGroups}>
                  Перейти к группам должностей
                </button>
              ) : null}
            </div>
          ) : (
            <select
              className="admin-form__select"
              value={form.groupId}
              onChange={(event) => setForm((prev) => ({ ...prev, groupId: event.target.value }))}
              required
            >
              {activeGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="admin-form__label">
          Описание
          <textarea
            className="admin-form__textarea"
            rows={3}
            value={form.description}
            maxLength={DESCRIPTION_MAX}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, description: event.target.value }))
            }
          />
        </label>

        {(localError || error) && <p className="admin-form__error">{localError || error}</p>}
      </form>
    </AdminModal>
  )
}
