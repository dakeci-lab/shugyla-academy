import { formatTeamScheduleCell } from '../../utils/shiftData'
import { CommentIcon } from '../icons/PlatformIcons'

/** Ячейка недельного графика: план, факт и бейдж без tooltip */
export default function TeamScheduleCell({ shift, onCommentClick }) {
  if (!shift) return null

  const { plannedTime, actualTime, showPlan, showActual, badge, comment } =
    formatTeamScheduleCell(shift)

  if (!showPlan && !badge && !comment) return null

  return (
    <div className={`team-schedule-cell__box${comment ? ' team-schedule-cell__box--has-comment' : ''}`}>
      {comment && (
        <button
          type="button"
          className="team-schedule-cell__comment-btn"
          onClick={(event) => {
            event.stopPropagation()
            onCommentClick?.(comment)
          }}
          aria-label="Показать комментарий"
        >
          <CommentIcon size={12} />
        </button>
      )}

      <div className="team-schedule-cell__inner">
        {showPlan && plannedTime && (
          <span className="team-schedule-cell__planned">{plannedTime}</span>
        )}

        {showActual && (
          <span className="team-schedule-cell__actual">
            Факт: {actualTime || '—'}
          </span>
        )}

        {badge && (
          <span className={`team-schedule-badge team-schedule-badge--${badge.variant}`}>
            {badge.label}
          </span>
        )}
      </div>
    </div>
  )
}
