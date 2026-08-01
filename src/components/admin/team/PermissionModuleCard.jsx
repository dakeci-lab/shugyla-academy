import { useEffect, useRef } from 'react'
import PermissionItem from './PermissionItem'

export default function PermissionModuleCard({
  group,
  selectedIds,
  savedIds,
  expanded,
  onToggleExpanded,
  onTogglePermission,
  onToggleModule,
  disabled,
}) {
  const ids = group.items.map((item) => item.id)
  const selectedCount = ids.filter((id) => selectedIds.includes(id)).length
  const allChecked = ids.length > 0 && selectedCount === ids.length
  const indeterminate = selectedCount > 0 && !allChecked
  const moduleCheckboxRef = useRef(null)

  useEffect(() => {
    if (moduleCheckboxRef.current) {
      moduleCheckboxRef.current.indeterminate = indeterminate
    }
  }, [indeterminate])

  const savedSet = new Set(savedIds)

  return (
    <section className="team-module-card">
      <div className="team-module-card__head">
        <button
          type="button"
          className="team-module-card__toggle"
          aria-expanded={expanded}
          aria-controls={`module-body-${group.module}`}
          onClick={() => onToggleExpanded(group.module)}
        >
          <span className="team-module-card__chevron" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
          <span className="team-module-card__titles">
            <span className="team-module-card__title">{group.label}</span>
            <span className="team-module-card__count">
              {selectedCount} из {ids.length}
            </span>
          </span>
        </button>

        <div className="team-module-card__module-actions">
          <label className="team-module-card__select-all">
            <input
              ref={moduleCheckboxRef}
              type="checkbox"
              checked={allChecked}
              aria-checked={indeterminate ? 'mixed' : allChecked}
              disabled={disabled || ids.length === 0}
              onChange={(event) => onToggleModule(ids, event.target.checked)}
            />
            <span>Весь модуль</span>
          </label>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={disabled || ids.length === 0}
            onClick={() => onToggleModule(ids, selectedCount !== ids.length)}
          >
            {allChecked ? 'Снять все' : 'Выбрать все'}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="team-module-card__body" id={`module-body-${group.module}`}>
          {group.items.map((permission) => {
            const checked = selectedIds.includes(permission.id)
            const wasChecked = savedSet.has(permission.id)
            return (
              <PermissionItem
                key={permission.id}
                permission={permission}
                checked={checked}
                changed={checked !== wasChecked}
                disabled={disabled}
                onToggle={onTogglePermission}
              />
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
