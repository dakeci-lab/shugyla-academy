import { useEffect, useState } from 'react'
import AdminModal from '../AdminModal'
import { DESCRIPTION_MAX, NAME_MAX, validateDescription, validateName } from './positionStructureUiUtils'

const EMPTY = { name: '', description: '' }

export default function PositionGroupFormModal({
  open,
  mode = 'create',
  initial,
  saving,
  error,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(EMPTY)
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({
      name: initial?.name || '',
      description: initial?.description || '',
    })
    setLocalError('')
  }, [open, initial])

  if (!open) return null

  const nameError = validateName(form.name)
  const descriptionError = validateDescription(form.description)
  const invalid = Boolean(nameError || descriptionError)

  function handleSubmit(event) {
    event?.preventDefault?.()
    if (invalid) {
      setLocalError(nameError || descriptionError)
      return
    }
    onSubmit({
      name: form.name.trim(),
      description: form.description.trim() || null,
    })
  }

  return (
    <AdminModal
      wide
      title={mode === 'edit' ? 'Редактирование группы' : 'Создание группы'}
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
