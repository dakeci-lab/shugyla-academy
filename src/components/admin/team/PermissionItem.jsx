export default function PermissionItem({
  permission,
  checked,
  changed,
  disabled,
  onToggle,
}) {
  return (
    <label
      className={`team-perm-item${changed ? ' team-perm-item--changed' : ''}${disabled ? ' team-perm-item--disabled' : ''}`}
      title={permission.code || undefined}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={() => onToggle(permission.id)}
        aria-label={permission.name}
      />
      <span className="team-perm-item__body">
        <span className="team-perm-item__name">
          {permission.name}
          {changed ? <span className="team-perm-item__changed-dot" aria-label="Изменено" /> : null}
        </span>
        {permission.description ? (
          <span className="team-perm-item__desc">{permission.description}</span>
        ) : null}
      </span>
    </label>
  )
}
