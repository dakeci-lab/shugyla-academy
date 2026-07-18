import { formatTeamScheduleCell, isWorkingShiftStatus, SHIFT_STATUS_LABELS } from '../../utils/shiftData'
import { CommentIcon } from '../icons/PlatformIcons'

/** Компактная ячейка недельного графика: план / статус дня (фиксированная высота) */
export default function TeamScheduleCell({ shift, onCommentClick }) {
  const { plannedTime, showPlan, badge, comment } = formatTeamScheduleCell(shift)
  const working = Boolean(shift && isWorkingShiftStatus(shift.status))
  const dayStatusLabel = shift
    ? SHIFT_STATUS_LABELS[shift.status] || badge?.label
    : ''

  const content =
    working && showPlan && plannedTime
      ? plannedTime
      : dayStatusLabel || ''

  return (
    <div className={`team-schedule-cell__box${comment ? ' team-schedule-cell__box--has-comment' : ''}`}>
      {comment ? (
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
      ) : null}

      <div className="team-schedule-cell__inner">
        {content ? (
          working && showPlan && plannedTime ? (
            <span className="team-schedule-cell__planned">{plannedTime}</span>
          ) : (
            <span className="team-schedule-cell__status">{content}</span>
          )
        ) : (
          <span className="team-schedule-cell__status team-schedule-cell__status--empty" aria-hidden="true">
            {'\u00a0'}
          </span>
        )}
      </div>
    </div>
  )
}
