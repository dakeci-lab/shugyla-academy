import { ABC_AXES, abcBadgeLabel, formatAbcClass } from '../../utils/procurementAbc'
import './ProcurementPlannerView.css'

export function AbcBadge({ axisLabel, value }) {
  const letter = formatAbcClass(value)
  const empty = letter === '—'
  const title = abcBadgeLabel(axisLabel, value)
  return (
    <span
      role="img"
      className={`proc-planner__abc-badge${empty ? ' is-empty' : ` is-${letter.toLowerCase()}`}`}
      title={title}
      aria-label={title}
    >
      {letter}
    </span>
  )
}

export function AbcBadges({ item, compact = false }) {
  return (
    <div
      className={`proc-planner__abc-badges${compact ? ' proc-planner__abc-badges--compact' : ''}`}
    >
      {ABC_AXES.map((axis) => (
        <AbcBadge key={axis.key} axisLabel={axis.label} value={item[axis.itemKey]} />
      ))}
    </div>
  )
}
