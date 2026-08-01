export default function PermissionSearchToolbar({
  query,
  onlyEnabled,
  onlyChanged,
  onQueryChange,
  onOnlyEnabledChange,
  onOnlyChangedChange,
  onSelectAll,
  onClearAll,
  resultCount,
  canManage,
  disabled,
}) {
  return (
    <div className="team-perm-toolbar">
      <label className="team-perm-toolbar__search">
        <span className="sr-only">Поиск разрешений</span>
        <input
          type="search"
          className="admin-form__input"
          placeholder="Поиск разрешений"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          disabled={disabled}
        />
      </label>

      <div className="team-perm-toolbar__toggles">
        <label className="team-perm-toolbar__toggle">
          <input
            type="checkbox"
            checked={onlyEnabled}
            onChange={(event) => onOnlyEnabledChange(event.target.checked)}
            disabled={disabled}
          />
          <span>Только включённые</span>
        </label>
        <label className="team-perm-toolbar__toggle">
          <input
            type="checkbox"
            checked={onlyChanged}
            onChange={(event) => onOnlyChangedChange(event.target.checked)}
            disabled={disabled}
          />
          <span>Только изменённые</span>
        </label>
      </div>

      {canManage ? (
        <div className="team-perm-toolbar__bulk">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onSelectAll} disabled={disabled}>
            Выбрать все
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClearAll} disabled={disabled}>
            Снять все
          </button>
        </div>
      ) : null}

      {query.trim() || onlyEnabled || onlyChanged ? (
        <p className="team-perm-toolbar__results" aria-live="polite">
          Найдено: {resultCount}
        </p>
      ) : null}
    </div>
  )
}
