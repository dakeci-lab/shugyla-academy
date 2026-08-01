export default function StructureReorderBar({
  visible,
  message = 'Порядок изменён',
  saving,
  onCancel,
  onSave,
}) {
  if (!visible) return null

  return (
    <div className="structure-reorder-bar" role="status" aria-live="polite">
      <span className="structure-reorder-bar__text">{message}</span>
      <div className="structure-reorder-bar__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={saving}>
          Отменить
        </button>
        <button type="button" className="btn btn--primary" onClick={onSave} disabled={saving}>
          {saving ? 'Сохранение…' : 'Сохранить порядок'}
        </button>
      </div>
    </div>
  )
}
