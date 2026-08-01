export default function StructureErrorState({ message, onRetry }) {
  return (
    <div className="structure-error" role="alert">
      <p className="admin-form__error">{message || 'Не удалось загрузить данные'}</p>
      {onRetry ? (
        <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry}>
          Повторить
        </button>
      ) : null}
    </div>
  )
}
