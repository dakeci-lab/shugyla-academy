import AdminModal from '../AdminModal'

export default function ConfirmRoleActionModal({
  open,
  title,
  message,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  secondaryLabel,
  onConfirm,
  onSecondary,
  onClose,
  danger = false,
  busy = false,
}) {
  if (!open) return null

  return (
    <AdminModal
      title={title}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          {secondaryLabel ? (
            <button type="button" className="btn btn--ghost" onClick={onSecondary} disabled={busy}>
              {secondaryLabel}
            </button>
          ) : null}
          <button
            type="button"
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Выполнение…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="team-mgmt__confirm-text">{message}</p>
    </AdminModal>
  )
}
