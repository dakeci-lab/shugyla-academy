import { useEffect, useState } from 'react'
import AdminModal from '../AdminModal'

/** Редактирование комментария к расчёту зарплаты */
export default function PayrollCommentModal({
  employeeName,
  initialNotes = '',
  saving = false,
  onClose,
  onSave,
}) {
  const [notes, setNotes] = useState(initialNotes)

  useEffect(() => {
    setNotes(initialNotes)
  }, [initialNotes])

  function handleSubmit(event) {
    event.preventDefault()
    onSave?.(notes)
  }

  return (
    <AdminModal
      title="Комментарий"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--outline" onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button type="submit" form="payroll-comment-form" className="btn btn--primary" disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </>
      }
    >
      <form id="payroll-comment-form" className="admin-form" onSubmit={handleSubmit}>
        <p className="admin-form__hint">{employeeName}</p>
        <label className="admin-form__label">
          Текст комментария
          <textarea
            className="admin-form__input"
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Комментарий к расчёту"
            autoFocus
          />
        </label>
      </form>
    </AdminModal>
  )
}
