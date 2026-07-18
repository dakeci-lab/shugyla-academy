import { formatTeamScheduleCell, isWorkingShiftStatus, SHIFT_STATUS_LABELS } from '../../utils/shiftData'
import { CommentIcon } from '../icons/PlatformIcons'

/** Компактная ячейка недельного графика: план / статус дня */
export default function TeamScheduleCell({ shift, onCommentClick }) {
  if (!shift) return null

  const { plannedTime, showPlan, badge, comment } = formatTeamScheduleCell(shift)
  const working = isWorkingShiftStatus(shift.status)
  const dayStatusLabel = SHIFT_STATUS_LABELS[shift.status] || badge?.label

  if (!showPlan && !dayStatusLabel && !comment) return null

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
        {working && showPlan && plannedTime ? (
          <span className="team-schedule-cell__planned">{plannedTime}</span>
        ) : (
          <span className="team-schedule-cell__status">{dayStatusLabel || '—'}</span>
        )}
      </div>
    </div>
  )
}
