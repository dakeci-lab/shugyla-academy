import { useEffect, useState } from 'react'
import AdminModal from '../AdminModal'
import {
  PAYROLL_PARTICIPATION,
  PAYROLL_PARTICIPATION_OPTIONS,
  normalizePayrollParticipation,
} from '../../../utils/employeeData'

/** Комментарий к расчёту + управление участием в ведомости */
export default function PayrollCommentModal({
  employeeName,
  initialNotes = '',
  initialParticipation = PAYROLL_PARTICIPATION.ACTIVE,
  saving = false,
  excluding = false,
  onClose,
  onSave,
  onExclude,
  onParticipationChange,
}) {
  const [notes, setNotes] = useState(initialNotes)
  const [participation, setParticipation] = useState(
    normalizePayrollParticipation(initialParticipation)
  )
  const [confirmExclude, setConfirmExclude] = useState(false)

  useEffect(() => {
    setNotes(initialNotes)
    setParticipation(normalizePayrollParticipation(initialParticipation))
    setConfirmExclude(false)
  }, [initialNotes, initialParticipation])

  const busy = saving || excluding
  const isExcluded = participation === PAYROLL_PARTICIPATION.EXCLUDED

  function handleSubmit(event) {
    event.preventDefault()
    onSave?.({
      notes,
      payrollParticipation: participation,
    })
  }

  function handleParticipationSelect(value) {
    const next = normalizePayrollParticipation(value)
    setParticipation(next)
    setConfirmExclude(false)
    onParticipationChange?.(next)
  }

  return (
    <AdminModal
      title="Комментарий и статус расчёта"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--outline" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button
            type="submit"
            form="payroll-comment-form"
            className="btn btn--primary"
            disabled={busy}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </>
      }
    >
      <form id="payroll-comment-form" className="admin-form" onSubmit={handleSubmit}>
        <p className="admin-form__hint">{employeeName}</p>

        <label className="admin-form__label">
          Статус расчёта
          <select
            className="admin-form__select"
            value={participation}
            onChange={(event) => handleParticipationSelect(event.target.value)}
            disabled={busy}
          >
            {PAYROLL_PARTICIPATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="admin-form__hint">
            Не влияет на статус сотрудника, даты приёма/увольнения и доступ к платформе.
          </span>
        </label>

        <label className="admin-form__label">
          Текст комментария
          <textarea
            className="admin-form__input"
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Комментарий к расчёту"
            autoFocus
            disabled={busy}
          />
        </label>

        {!isExcluded && (
          <div className="payroll-comment-modal__danger">
            {!confirmExclude ? (
              <button
                type="button"
                className="btn btn--danger btn--sm"
                disabled={busy}
                onClick={() => setConfirmExclude(true)}
              >
                Исключить из расчёта
              </button>
            ) : (
              <div className="payroll-comment-modal__confirm">
                <p className="admin-form__hint">
                  Сотрудник останется в системе, но исчезнет из активной ведомости. Продолжить?
                </p>
                <div className="payroll-comment-modal__confirm-actions">
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    disabled={busy}
                    onClick={() => setConfirmExclude(false)}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    disabled={busy}
                    onClick={() => onExclude?.()}
                  >
                    {excluding ? 'Исключение…' : 'Подтвердить исключение'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </AdminModal>
  )
}
