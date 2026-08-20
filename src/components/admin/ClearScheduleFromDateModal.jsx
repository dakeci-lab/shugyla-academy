import { useState } from 'react'
import AdminModal from './AdminModal'
import ConfirmDialog from './ConfirmDialog'
import './admin-shared.css'

function formatDateRu(dateKey) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey || '—'
  const [y, m, d] = dateKey.split('-')
  return `${d}.${m}.${y}`
}

/** Очистить плановые смены с выбранной даты (включительно), без факта attendance. */
export default function ClearScheduleFromDateModal({
  employeeName,
  defaultFromDate = '',
  onClose,
  onConfirm,
}) {
  const [fromDate, setFromDate] = useState(defaultFromDate)
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  function handleSubmit(event) {
    event.preventDefault()
    if (!fromDate || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
      setError('Укажите дату начала очистки')
      return
    }
    setError('')
    setShowConfirm(true)
  }

  async function handleConfirm() {
    if (submitting) return
    setSubmitting(true)
    try {
      await onConfirm(fromDate)
      setShowConfirm(false)
    } catch (err) {
      setShowConfirm(false)
      setError(err?.message || 'Не удалось очистить график')
    } finally {
      setSubmitting(false)
    }
  }

  if (showConfirm) {
    return (
      <ConfirmDialog
        title="Очистить график с даты?"
        message={`С ${formatDateRu(fromDate)} включительно будут удалены плановые смены сотрудника «${employeeName}» без отметок прихода/ухода. Смены с фактом останутся.`}
        confirmLabel="Очистить"
        onCancel={() => setShowConfirm(false)}
        onConfirm={handleConfirm}
        loading={submitting}
      />
    )
  }

  return (
    <AdminModal
      title="Очистить график с даты…"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--outline" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn--primary" form="clear-schedule-from-form">
            Далее
          </button>
        </>
      }
    >
      <form id="clear-schedule-from-form" className="admin-form" onSubmit={handleSubmit}>
        <p className="admin-form__hint">
          Удаляются только плановые дни с выбранной даты <strong>включительно</strong>, у которых
          нет отметок прихода/ухода. Подходит для активных сотрудников и для ремонта хвоста у
          уволенных.
        </p>
        <label className="admin-form__label">
          С даты *
          <input
            type="date"
            className="admin-form__input"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            required
          />
        </label>
        {error && <p className="admin-form__error">{error}</p>}
      </form>
    </AdminModal>
  )
}
