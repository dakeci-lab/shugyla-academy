import AdminModal from '../AdminModal'
import '../RolesAccessSection.css'
import '../admin-shared.css'

export default function PaymentAccountEditorModal({
  open,
  mode,
  form,
  setForm,
  onSave,
  onClose,
  saving,
  error,
}) {
  if (!open) return null

  const title = mode === 'create' ? 'Новый счёт оплаты' : 'Редактирование счёта оплаты'

  return (
    <AdminModal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn btn--primary" onClick={onSave} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </>
      }
    >
      <form className="roles-access__form" onSubmit={onSave}>
        <label className="admin-form__label">
          Название *
          <input
            className="admin-form__input"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Например: Kaspi, Halyk, Наличные"
            required
            autoFocus
          />
        </label>

        <label className="admin-form__label">
          Описание
          <textarea
            className="admin-form__textarea"
            rows={2}
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          />
        </label>

        {mode === 'edit' ? (
          <label className="roles-access__checkbox-row">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            />
            Активен
          </label>
        ) : null}

        {error ? <p className="admin-form__error">{error}</p> : null}
      </form>
    </AdminModal>
  )
}
